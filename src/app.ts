import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { HttpBindings } from '@hono/node-server';
import { CitationFilter } from './citations.js';
import { RateLimiter } from './rate-limit.js';
import { streamSSE } from 'hono/streaming';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { LanguageModel } from 'ai';
import { runAgent, MAX_INPUT_CHARACTERS } from './agent.js';
import { prepareContext } from './context.js';
import type { SemanticMemory } from './memory/semantic.js';
import { MemoryStore, type SearchLog } from './memory/db.js';
import type { SearchProvider, SearchResult } from './search/types.js';
import { tokenMetrics, type TurnLog } from './telemetry.js';

const requestSchema = z.object({
  message: z.string().trim().min(1).max(MAX_INPUT_CHARACTERS),
  userId: z.string().min(1).max(100), conversationId: z.string().min(1).max(100),
  timezone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }),
});
export function createApp(options: { store: MemoryStore; search: () => SearchProvider; model?: LanguageModel; now?: () => Date;
  memory?: SemanticMemory; rateLimit?: { limit: number; windowMs: number }; logTurn?: (record: TurnLog) => void;
}) {
  const app = new Hono<{ Bindings: HttpBindings }>();
  const limiter = new RateLimiter(options.rateLimit?.limit, options.rateLimit?.windowMs);
  const logTurn = options.logTurn ?? (record => console.log(JSON.stringify(record)));
  app.use('/chat', async (c,next) => {
    if (c.req.method === 'POST') {
      const decision = limiter.take(c.env?.incoming?.socket?.remoteAddress ?? 'local');
      if (!decision.allowed) {
        c.header('Retry-After', String(decision.retryAfter));
        return c.json({ error: 'Too many requests. Please wait a minute before trying again.' }, 429);
      }
    }
    await next();
  });
  app.use('/chat', bodyLimit({ maxSize: 65536, onError: c => c.json({ error: 'The chat request is too large.' }, 413) }));
  const busy = new Set<string>();
  app.get('/', async c => c.html(await readFile(new URL('../public/index.html', import.meta.url), 'utf8')));
  app.get('/health', c => c.json({ status: 'ok', phase: 7 }));
  const historyQuery = z.object({ userId: z.string().min(1).max(100), before: z.coerce.number().int().positive().safe().optional() });
  app.get('/conversations', c => {
    const query = historyQuery.safeParse(c.req.query());
    if (!query.success) return c.json({ error: 'Provide a valid userId and history cursor.' }, 400);
    c.header('Cache-Control','no-store');
    return c.json(options.store.conversationList(query.data.userId, query.data.before));
  });
  app.get('/conversations/:conversationId', c => {
    const query = historyQuery.safeParse(c.req.query());
    const id = z.string().min(1).max(100).safeParse(c.req.param('conversationId'));
    if (!query.success || !id.success) return c.json({ error: 'Provide a valid conversation, userId, and history cursor.' }, 400);
    c.header('Cache-Control','no-store');
    return c.json(options.store.conversationPage(query.data.userId, id.data, query.data.before));
  });
  app.post('/chat', async c => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: 'Send a JSON chat request.' }, 400); }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Provide a message, userId, conversationId, and valid timezone.' }, 400);
    const { message, userId, conversationId, timezone } = parsed.data;
    const key = JSON.stringify([userId, conversationId]);
    if (busy.has(key)) return c.json({ error: 'Wait for the current reply to finish.' }, 409);
    const now = options.now?.() ?? new Date();
    const history = options.store.conversationTurns(userId, conversationId).map(t => ({ role: t.role, content: t.content }));
    const base = { user_id: userId, conversation_id: conversationId, created_at: now.toISOString(), tz: timezone };
    const userTurn = options.store.saveTurn({ ...base, role: 'user', content: message });
    busy.add(key);
    return streamSSE(c, async stream => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      stream.onAbort(abort);
      c.req.raw.signal.addEventListener('abort', abort, { once: true });
      if (c.req.raw.signal.aborted) abort();
      const start = performance.now();
      let firstTokenMs: number | null = null;
      let ttfbMs = 0;
      let text = '';
      let complete = false;
      let outcome: TurnLog['outcome'] = 'error';
      let tokens = tokenMetrics();
      let retrieval: { semantic: string; latencyMs: number; selected: number; ambiguous: boolean } | undefined;
      const sources = new Map<string, SearchResult>();
      const searches: SearchLog[] = [];
      const citations = new CitationFilter(n => sources.has(`s${n}`));
      let writes = Promise.resolve();
      const send = (event: string, data: unknown) => {
        // Serialize concurrent search events so SSE frames cannot interleave.
        writes = writes.then(async () => { if (!controller.signal.aborted) await stream.writeSSE({ event, data: JSON.stringify(data) }); }).catch(() => abort());
        return writes;
      };
      try {
        await send('status', { type: 'thinking' });
        ttfbMs = Math.round(performance.now() - start);
        const context = await prepareContext({ store: options.store, userId, message, history, now, timezone,
          memory: options.memory, signal: controller.signal, excludeQuestionId: userTurn });
        retrieval = { semantic: context.retrieval.semantic, latencyMs: context.retrieval.latencyMs, selected: context.retrieval.selectedIds.length, ambiguous: context.retrieval.ambiguous };
        const provider = options.search();
        const result = runAgent({ ...context, model: options.model, now, timezone, signal: controller.signal,
          onSearch: e => { if (e.phase === 'start') void send('status', { type: 'searching', query: e.query, since: e.since }); },
          search: { search: async (query, filters) => {
            const began = performance.now();
            const log: SearchLog = { query, since: filters?.since, until: filters?.until, resultCount: 0, latencyMs: 0 };
            try {
              const response = await provider.search(query, filters);
              log.resultCount = response.results.length;
              for (const source of response.results) sources.set(source.id, source);
              await send('sources', { sources: [...sources.values()].map(s => ({ n: Number(s.id.slice(1)), title: s.title, url: s.url, domain: s.domain, publishedDate: s.publishedDate })) });
              return response;
            } catch (error) { log.failed = true; throw error; }
            finally { log.latencyMs = Math.round(performance.now() - began); searches.push(log); }
          } },
        });
        for await (const part of result.fullStream) {
          if (part.type === 'error') throw part.error;
          if (part.type === 'text-delta') {
            const delta = citations.push(part.text);
            if (delta) { firstTokenMs ??= Math.round(performance.now() - start); text += delta; await send('text', { delta }); }
          }
        }
        const tail = citations.flush();
        if (tail) { text += tail; await send('text', { delta: tail }); }
        if (controller.signal.aborted) throw new Error('Aborted');
        const usage = await result.totalUsage;
        tokens = tokenMetrics(usage);
        const finishReason = await result.finishReason;
        if (finishReason === 'length') { outcome = 'truncated'; throw new Error('Truncated'); }
        if (finishReason !== 'stop' || !text.trim()) throw new Error('Incomplete');
        complete = true;
        outcome = 'complete';
      } catch {
        const tail = citations.flush();
        if (tail) { text += tail; await send('text', { delta: tail }); }
        if (controller.signal.aborted) outcome = 'aborted';
        if (!controller.signal.aborted) await send('error', { message: 'The reply could not finish. Check the server connection and try again.' });
      } finally {
        let turnId: number | null = null;
        const timings = { ttfbMs, firstTokenMs, totalMs: Math.round(performance.now() - start) };
        try {
          turnId = complete || text ? options.store.saveTurn({ ...base, role: 'assistant', content: text + (complete ? '' : '\n[Generation interrupted.]') }) : userTurn;
          options.store.saveEvidence(turnId, [...sources.values()], searches, now.toISOString());
          if (complete) {
            await send('done', { turnId, timings, searches });
            // Index after the answer is delivered; failure never discards the saved exchange.
            options.memory?.scheduleIndex(userId,now.toISOString());
          }
        } catch {
          outcome = 'error';
          if (!controller.signal.aborted) await send('error', { message: 'The reply could not be saved. Please try again.' });
        } finally {
          busy.delete(key);
          c.req.raw.signal.removeEventListener('abort', abort);
          // Log only allowlisted metrics, never prompts, queries, headers or upstream errors.
          try { logTurn({ event: 'turn', userTurnId: userTurn, turnId, outcome,
            searches: searches.map(s => ({ resultCount: s.resultCount, latencyMs: s.latencyMs, failed: s.failed ?? false })),
            timings, tokens, retrieval, invalidCitations: citations.invalidCount }); } catch {}
        }
      }
    });
  });
  app.onError((_error, c) => c.json({ error: 'The request could not be completed.' }, 500));
  return app;
}

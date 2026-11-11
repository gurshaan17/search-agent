import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { LanguageModel } from 'ai';
import { runAgent } from './agent.js';
import { buildContext } from './context.js';
import { MemoryStore, type SearchLog } from './memory/db.js';
import type { SearchProvider, SearchResult } from './search/types.js';

const requestSchema = z.object({
  message: z.string().trim().min(1).max(20000),
  userId: z.string().min(1).max(100), conversationId: z.string().min(1).max(100),
  timezone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }),
});
export function createApp(options: { store: MemoryStore; search: () => SearchProvider; model?: LanguageModel; now?: () => Date }) {
  const app = new Hono();
  const busy = new Set<string>();
  app.get('/', async c => c.html(await readFile(new URL('../public/index.html', import.meta.url), 'utf8')));
  app.get('/health', c => c.json({ status: 'ok', phase: 5 }));
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
    const context = buildContext({ store: options.store, userId, message, history, now, timezone });
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
      const sources = new Map<string, SearchResult>();
      const searches: SearchLog[] = [];
      let writes = Promise.resolve();
      const send = (event: string, data: unknown) => {
        // Serialize concurrent search events so SSE frames cannot interleave.
        writes = writes.then(async () => { if (!controller.signal.aborted) await stream.writeSSE({ event, data: JSON.stringify(data) }); }).catch(() => abort());
        return writes;
      };
      try {
        await send('status', { type: 'thinking' });
        ttfbMs = Math.round(performance.now() - start);
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
            firstTokenMs ??= Math.round(performance.now() - start);
            text += part.text;
            await send('text', { delta: part.text });
          }
        }
        if (controller.signal.aborted) throw new Error('Aborted');
        complete = true;
      } catch {
        if (!controller.signal.aborted) await send('error', { message: 'The reply could not finish. Check the server connection and try again.' });
      } finally {
        try {
          // Keep interrupted text explicit in recall; retain search evidence even with no answer.
          const turnId = complete || text ? options.store.saveTurn({ ...base, role: 'assistant', content: text + (complete ? '' : '\n[Generation interrupted.]') }) : userTurn;
          options.store.saveEvidence(turnId, [...sources.values()], searches, now.toISOString());
          if (complete) await send('done', { turnId, timings: { ttfbMs, firstTokenMs, totalMs: Math.round(performance.now() - start) }, searches });
        } finally {
          busy.delete(key);
          c.req.raw.signal.removeEventListener('abort', abort);
        }
      }
    });
  });
  app.onError((_error, c) => c.json({ error: 'The request could not be completed.' }, 500));
  return app;
}

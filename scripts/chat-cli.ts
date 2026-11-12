import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { SemanticMemory } from '../src/memory/semantic.js';
import { createEmbedder } from '../src/memory/embeddings.js';
import { MemoryStore, type SearchLog } from '../src/memory/db.js';
import { prepareContext } from '../src/context.js';
import { createInterface } from 'node:readline';
import type { ModelMessage } from 'ai';
import { CitationFilter } from '../src/citations.js';
import { tokenMetrics, type TurnLog } from '../src/telemetry.js';
import { runAgent, MAX_INPUT_CHARACTERS } from '../src/agent.js';
import { createExaProvider } from '../src/search/exa.js';
import type { SearchResult } from '../src/search/types.js';
import { MockSearchProvider } from '../src/search/mock.js';

const backend = process.env.SEARCH_PROVIDER?.trim() || 'exa';
if (!['exa', 'mock'].includes(backend)) throw new Error('SEARCH_PROVIDER must be exa or mock.');
if (!process.env.GEMINI_API_KEY?.trim()) throw new Error('GEMINI_API_KEY is required.');
if (backend === 'exa' && !process.env.EXA_API_KEY?.trim()) throw new Error('EXA_API_KEY is required.');
const store = new MemoryStore();
const memory = new SemanticMemory(store,createEmbedder());
const userId = process.env.CLI_USER_ID?.trim() || 'local';
const conversationId = randomUUID();
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const messages: ModelMessage[] = [];
try {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  if (process.stdin.isTTY) process.stdout.write('You> ');
  for await (const line of lines) {
    if (line.trim() === '/exit') break;
    if (!line.trim()) continue;
    if (line.length > MAX_INPUT_CHARACTERS) { console.error('The question is too long (maximum 20000 characters).'); continue; }
    const now = process.env.AGENT_NOW?.trim() ? new Date(process.env.AGENT_NOW) : new Date();
    const context = await prepareContext({ memory, store, userId, message: line, history: messages, now, timezone });
    const user: ModelMessage = { role: 'user', content: line };
    const base = { user_id: userId, conversation_id: conversationId, created_at: now.toISOString(), tz: timezone };
    const userTurnId = store.saveTurn({ ...base, role: 'user', content: line });
    let evidenceTurnId = userTurnId;
    const searches: SearchLog[] = [];
    let text = '';
    const search = backend === 'mock' ? new MockSearchProvider({}) : createExaProvider(process.env.EXA_API_KEY!);
    const sources = new Map<string, SearchResult>();
    const citations = new CitationFilter(n => sources.has(`s${n}`));
    const started = performance.now();
    let firstTokenMs: number | null = null;
    let outcome: TurnLog['outcome'] = 'error';
    let tokens = tokenMetrics();
    try {
      const result = runAgent({ ...context, search: { search: async (query, options) => {
        const start = performance.now();
        const log: SearchLog = { query, since: options?.since, until: options?.until, resultCount: 0, latencyMs: 0 };
        try {
          const response = await search.search(query, options);
              options?.signal?.throwIfAborted();
          log.resultCount = response.results.length;
          for (const source of response.results) sources.set(source.id, source);
          return response;
        } catch (error) { log.failed = true; throw error; }
        finally { log.latencyMs = Math.round(performance.now() - start); searches.push(log); }
      } },
        now, timezone,
        onSearch: ({ phase, step, at }) => console.error(JSON.stringify({ phase, step, at })),
      });
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') { const delta = citations.push(part.text); if (delta) { firstTokenMs ??= Math.round(performance.now() - started); text += delta; process.stdout.write(delta); } }
        if (part.type === 'error') throw part.error;
      }
      const tail = citations.flush(); text += tail; process.stdout.write(tail);
      tokens = tokenMetrics(await result.totalUsage);
      const reason = await result.finishReason;
      if (reason === 'length') { outcome = 'truncated'; throw new Error('Truncated'); }
      if (reason !== 'stop' || !text.trim()) throw new Error('Incomplete');
      outcome = 'complete';
      messages.push(user, { role: 'assistant', content: text });
      evidenceTurnId = store.saveTurn({ ...base, role: 'assistant', content: text });
      process.stdout.write('\n');
      for (const source of sources.values()) console.log(`[${source.id.slice(1)}] ${source.title}: ${source.url}`);
    } catch {
      const tail = citations.flush(); text += tail; process.stdout.write(tail);
      console.error('Turn failed. Check credentials, model availability, and connectivity.');
      messages.push(user);
      if (text) evidenceTurnId = store.saveTurn({ ...base, role: 'assistant', content: text + '\n[Generation interrupted.]' });
      process.exitCode = 1;
    } finally {
      store.saveEvidence(evidenceTurnId, [...sources.values()], searches, now.toISOString());
      if (outcome === 'complete') await memory.index(userId,now.toISOString(),AbortSignal.timeout(4000)).catch(() => {});
      const log: TurnLog = { event: 'turn', userTurnId, turnId: evidenceTurnId, outcome,
        searches: searches.map(s => ({ resultCount: s.resultCount, latencyMs: s.latencyMs, failed: s.failed ?? false })),
        timings: { ttfbMs: 0, firstTokenMs, totalMs: Math.round(performance.now() - started) }, tokens, invalidCitations: citations.invalidCount };
      console.error(JSON.stringify(log));
    }
    if (process.stdin.isTTY) process.stdout.write('You> ');
  }
  lines.close();
} finally { store.close(); }

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { MemoryStore, type SearchLog } from '../src/memory/db.js';
import { buildContext } from '../src/context.js';
import { createInterface } from 'node:readline';
import type { ModelMessage } from 'ai';
import { runAgent } from '../src/agent.js';
import { createExaProvider } from '../src/search/exa.js';
import type { SearchResult } from '../src/search/types.js';
import { MockSearchProvider } from '../src/search/mock.js';

const backend = process.env.SEARCH_PROVIDER?.trim() || 'exa';
if (!['exa', 'mock'].includes(backend)) throw new Error('SEARCH_PROVIDER must be exa or mock.');
if (!process.env.GEMINI_API_KEY?.trim()) throw new Error('GEMINI_API_KEY is required.');
if (backend === 'exa' && !process.env.EXA_API_KEY?.trim()) throw new Error('EXA_API_KEY is required.');
const store = new MemoryStore();
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
    const now = process.env.AGENT_NOW?.trim() ? new Date(process.env.AGENT_NOW) : new Date();
    const context = buildContext({ store, userId, message: line, history: messages, now, timezone });
    const user: ModelMessage = { role: 'user', content: line };
    const base = { user_id: userId, conversation_id: conversationId, created_at: now.toISOString(), tz: timezone };
    const userTurnId = store.saveTurn({ ...base, role: 'user', content: line });
    let evidenceTurnId = userTurnId;
    const searches: SearchLog[] = [];
    let text = '';
    const search = backend === 'mock' ? new MockSearchProvider({}) : createExaProvider(process.env.EXA_API_KEY!);
    const sources = new Map<string, SearchResult>();
    try {
      const result = runAgent({ messages: context.messages, context: context.context, search: { search: async (query, options) => {
        const start = performance.now();
        const log: SearchLog = { query, since: options?.since, until: options?.until, resultCount: 0, latencyMs: 0 };
        try {
          const response = await search.search(query, options);
          log.resultCount = response.results.length;
          for (const source of response.results) sources.set(source.id, source);
          return response;
        } catch (error) { log.failed = true; throw error; }
        finally { log.latencyMs = Math.round(performance.now() - start); searches.push(log); }
      } },
        now, timezone,
        onSearch: event => console.error(JSON.stringify(event)),
      });
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') { text += part.text; process.stdout.write(part.text); }
        if (part.type === 'error') throw part.error;
      }
      messages.push(user, ...(await result.response).messages);
      evidenceTurnId = store.saveTurn({ ...base, role: 'assistant', content: text });
      process.stdout.write('\n');
      for (const source of sources.values()) console.log(`[${source.id.slice(1)}] ${source.title}: ${source.url}`);
    } catch {
      console.error('Turn failed. Check credentials, model availability, and connectivity.');
      messages.push(user);
      if (text) evidenceTurnId = store.saveTurn({ ...base, role: 'assistant', content: text + '\n[Generation interrupted.]' });
      process.exitCode = 1;
    } finally {
      store.saveEvidence(evidenceTurnId, [...sources.values()], searches, now.toISOString());
    }
    if (process.stdin.isTTY) process.stdout.write('You> ');
  }
  lines.close();
} finally { store.close(); }

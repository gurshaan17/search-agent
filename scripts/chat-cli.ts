import 'dotenv/config';
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
const messages: ModelMessage[] = [];
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
if (process.stdin.isTTY) process.stdout.write('You> ');
for await (const line of lines) {
  if (line.trim() === '/exit') break;
  if (!line.trim()) continue;
  const user: ModelMessage = { role: 'user', content: line };
  const search = backend === 'mock' ? new MockSearchProvider({}) : createExaProvider(process.env.EXA_API_KEY!);
  const sources = new Map<string, SearchResult>();
  try {
    const result = runAgent({ messages: [...messages, user], search: { search: async (query, options) => {
      const response = await search.search(query, options);
      for (const source of response.results) sources.set(source.id, source);
      return response;
    } },
      now: process.env.AGENT_NOW?.trim() ? new Date(process.env.AGENT_NOW) : new Date(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      onSearch: event => console.error(JSON.stringify(event)),
    });
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') process.stdout.write(part.text);
      if (part.type === 'error') throw part.error;
    }
    messages.push(user, ...(await result.response).messages);
    process.stdout.write('\n');
    for (const source of sources.values()) console.log(`[${source.id.slice(1)}] ${source.title}: ${source.url}`);
  } catch {
    console.error('Turn failed. Check credentials, model availability, and connectivity.');
    process.exitCode = 1;
  }
  if (process.stdin.isTTY) process.stdout.write('You> ');
}
lines.close();

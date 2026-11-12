import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { SemanticMemory } from './memory/semantic.js';
import { createEmbedder } from './memory/embeddings.js';
import { MemoryStore } from './memory/db.js';
import { createExaProvider } from './search/exa.js';
import { MockSearchProvider } from './search/mock.js';
const provider = process.env.SEARCH_PROVIDER?.trim() || 'exa';
if (!['exa', 'mock'].includes(provider)) throw new Error('SEARCH_PROVIDER must be exa or mock.');
const required = provider === 'mock' ? ['GEMINI_API_KEY'] : ['GEMINI_API_KEY', 'EXA_API_KEY'];
const missing = required.filter(name => !process.env[name]?.trim());
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
if (process.env.AGENT_NOW?.trim() && !Number.isFinite(Date.parse(process.env.AGENT_NOW))) throw new Error('AGENT_NOW must be a valid ISO timestamp.');
const store = new MemoryStore();
const memory = new SemanticMemory(store,createEmbedder());
const app = createApp({ store, memory,
  search: () => provider === 'mock' ? new MockSearchProvider({}) : createExaProvider(process.env.EXA_API_KEY!),
  now: () => process.env.AGENT_NOW?.trim() ? new Date(process.env.AGENT_NOW) : new Date(),
});
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => console.log(`Chat running at http://localhost:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { server.close(() => { void memory.drain().finally(() => { store.close(); process.exit(0); }); }); if ('closeAllConnections' in server) server.closeAllConnections(); });

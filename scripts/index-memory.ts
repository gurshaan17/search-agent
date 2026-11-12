import 'dotenv/config';
import { MemoryStore } from '../src/memory/db.js';
import { createEmbedder } from '../src/memory/embeddings.js';
import { SemanticMemory } from '../src/memory/semantic.js';
if (!process.env.GEMINI_API_KEY?.trim()) throw new Error('GEMINI_API_KEY is required.');
const store = new MemoryStore();
const memory = new SemanticMemory(store,createEmbedder());
let indexed = 0;
try {
  for (const userId of store.memoryOwners()) {
    for (;;) {
      const count = await memory.index(userId,new Date().toISOString(),AbortSignal.timeout(30000));
      indexed += count;
      if (!count) break;
    }
  }
  console.log(JSON.stringify({ indexedExchanges:indexed }));
} catch { console.error('Memory indexing did not finish. Saved chats are intact; check Gemini availability and rerun.'); process.exitCode = 1; }
finally { store.close(); }

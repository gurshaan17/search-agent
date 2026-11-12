import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { MemoryStore } from '../src/memory/db.js';
import { createEmbedder } from '../src/memory/embeddings.js';
import { SemanticMemory } from '../src/memory/semantic.js';
import { buildContext } from '../src/context.js';
import { resolveDays } from '../src/memory/recall.js';
import { memoryCases, seedMemoryCases } from './memory-fixtures.js';
const store = new MemoryStore(':memory:');
const now = new Date('2026-11-11T04:30:00Z');
const memory = new SemanticMemory(store,createEmbedder(),15000);
const records = [];
try {
  const ids = seedMemoryCases(store,'eval');
  const start = performance.now();
  while (await memory.index('eval',now.toISOString(),AbortSignal.timeout(30000))) {}
  const indexingMs = Math.round(performance.now() - start);
  for (const c of memoryCases) {
    const options = { store,userId:'eval',message:c.question,history:[],now,timezone:'UTC' };
    const lexical = buildContext(options);
    const semantic = await memory.retrieve('eval',c.question,now.toISOString(),undefined,resolveDays(c.question,now,'UTC'));
    const hybrid = buildContext({ ...options,semantic });
    const expected = c.expected ? ids[c.expected] : null;
    const hit = (selected: number[]) => expected === null ? selected.length === 0 : selected.includes(expected);
    records.push({ id:c.id,expected,lexical:lexical.retrieval.selectedIds,hybrid:hybrid.retrieval.selectedIds,
      lexicalPass:hit(lexical.retrieval.selectedIds),hybridPass:hit(hybrid.retrieval.selectedIds),
      top1:expected === null ? hybrid.retrieval.selectedIds.length === 0 : hybrid.retrieval.selectedIds[0] === expected,
      scores:semantic.hits.map(h => ({id:h.questionId,score:h.score})),
      latencyMs:hybrid.retrieval.latencyMs,semantic:hybrid.retrieval.semantic,
      matches:hybrid.context.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line)),
    });
  }
  const result = { indexingMs, records };
  console.table(records.map(({matches,scores,...r}) => r));
  await writeFile('docs/evals/hybrid-retrieval.json',JSON.stringify(result,null,2)+'\n');
  if (records.some(r => !r.hybridPass || r.semantic !== 'ready')) process.exitCode = 1;
} catch { console.error('Retrieval evaluation failed; check embedding availability.'); process.exitCode = 1; } finally { store.close(); }

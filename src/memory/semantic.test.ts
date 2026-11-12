import { afterEach, expect, test } from 'vitest';
import { MemoryStore } from './db.js';
import { SemanticMemory } from './semantic.js';
import type { Embedder } from './embeddings.js';
import { prepareContext } from '../context.js';
import { resolveDays } from './recall.js';
const now = new Date('2026-11-11T04:30:00Z');
const stores: MemoryStore[] = [];
afterEach(() => { stores.splice(0).forEach(s => s.close()); });
function setup() { const store = new MemoryStore(':memory:'); stores.push(store); return store; }
function save(store: MemoryStore, question: string, answer: string, day = '2026-11-03', owner = 'alice', conversation = day) {
  const base = { user_id: owner, conversation_id: conversation, created_at: `${day}T04:30:00Z`, tz: 'UTC' };
  store.saveTurn({ ...base, role: 'user', content: question });
  store.saveTurn({ ...base, role: 'assistant', content: answer });
}
const embedder: Embedder = { version: 'test', async embed(texts) { return texts.map(t => /SQLite|database|storage|ਸਤ/.test(t) ? [1,0] : [0,1]); } };
test('semantic retrieval finds assistant-only concepts, caches documents and excludes other owners/future answers', async () => {
  const store = setup();
  save(store,'What should I choose?','SQLite works locally.');
  save(store,'Private','Secret database','2026-11-03','bob');
  save(store,'Future','database later','2026-12-01');
  const requests: string[][] = [];
  const memory = new SemanticMemory(store,{ ...embedder, async embed(texts,kind) { if (kind === 'document') requests.push(texts); return embedder.embed(texts,kind); } });
  const options = { store, userId: 'alice', message: 'What storage did you suggest?', history: [], now, timezone: 'UTC', memory };
  const context = await prepareContext(options);
  expect(context.context).toContain('SQLite works locally');
  expect(context.context).not.toMatch(/Secret|database later/);
  expect(context.retrieval.semantic).toBe('ready');
  await prepareContext(options);
  expect(requests).toHaveLength(1);
  expect(requests.flat().join(' ')).not.toContain('Secret');
});
test('embedding failure preserves lexical/date retrieval without inventing semantic matches', async () => {
  const store = setup(); save(store,'SQLite','Use SQLite');
  const memory = new SemanticMemory(store,{ version:'broken', async embed() { throw new Error('secret'); } });
  const context = await prepareContext({ store, memory, userId:'alice', message:'SQLite', history:[], now, timezone:'UTC' });
  expect(context.context).toContain('Use SQLite');
  expect(context.retrieval.semantic).toBe('unavailable');
  expect(context.context).not.toContain('secret');
});
test('weekday ambiguity considers only the two past occurrences; explicit dates stay exact', () => {
  expect(resolveDays('last Tuesday',now,'UTC').map(d => d.day).sort()).toEqual(['2026-11-03','2026-11-10']);
  expect(resolveDays('3 November',now,'UTC').map(d => d.day)).toEqual(['2026-11-03']);
});
test('topic evidence resolves weekday candidates and keeps corrections in neighbouring context', async () => {
  const store = setup(); save(store,'Pick storage','SQLite','2026-11-03'); save(store,'Dinner','Bread','2026-11-10');
  const memory = new SemanticMemory(store,embedder);
  const c = await prepareContext({ store,memory,userId:'alice',message:'Last Tuesday we discussed a database',history:[],now,timezone:'UTC' });
  expect(c.retrieval.selectedIds[0]).toBe(1);
  expect(c.retrieval.ambiguous).toBe(false);
  save(store,'Correction to that recommendation','Use PostgreSQL instead','2026-11-03','alice','2026-11-03');
  const corrected = await prepareContext({ store,memory,userId:'alice',message:'Correction',history:[],now,timezone:'UTC' });
  expect(corrected.context).toContain('Use PostgreSQL instead');
  expect(corrected.context).toContain('SQLite');
});
test('low semantic similarity is not treated as a matching memory', async () => {
  const store = setup(); save(store,'Dinner','Bread');
  const context = await prepareContext({ store,memory:new SemanticMemory(store,embedder),userId:'alice',message:'database',history:[],now,timezone:'UTC' });
  expect(context.retrieval.selectedIds).toEqual([]);
});
test('aborted retrieval stops before model context and does not save incomplete embeddings', async () => {
  const store = setup(); save(store,'storage','SQLite');
  const controller = new AbortController(); controller.abort();
  const memory = new SemanticMemory(store,{ version:'abort',async embed(_texts,_kind,signal) { signal?.throwIfAborted(); return []; } });
  await expect(prepareContext({ store,memory,userId:'alice',message:'storage',history:[],now,timezone:'UTC',signal:controller.signal })).rejects.toThrow();
  expect(store.pendingExchanges('alice',now.toISOString(),'abort')).toHaveLength(1);
});
test('two equally relevant weekday matches are marked ambiguous rather than silently picking a date', async () => {
  const store = setup(); save(store,'database','SQLite','2026-11-03'); save(store,'database','SQLite','2026-11-10');
  const context = await prepareContext({store,memory:new SemanticMemory(store,embedder),userId:'alice',message:'last Tuesday database',history:[],now,timezone:'UTC'});
  expect(context.retrieval.ambiguous).toBe(true);
  expect(context.context).toContain('2026-11-03');
  expect(context.context).toContain('2026-11-10');
});
test('legacy indexing is bounded, reports partial coverage, and progresses without rewriting saved turns', async () => {
  const store = setup();
  for (let i=0;i<10;i++) save(store,`database ${i}`,'SQLite','2026-11-03','alice',String(i));
  const memory = new SemanticMemory(store,embedder);
  expect((await memory.retrieve('alice','database',now.toISOString())).status).toBe('partial');
  expect((await memory.retrieve('alice','database',now.toISOString())).status).toBe('ready');
  expect(store.conversationTurns('alice','0').map(t => t.content)).toEqual(['database 0','SQLite']);
});
test('provider timeout degrades to lexical recall within its deadline', async () => {
  const store = setup(); save(store,'SQLite','Local database');
  const memory = new SemanticMemory(store,{version:'slow',embed:async(_texts,_kind,signal) => new Promise((_resolve,reject) => {
    if (signal?.aborted) reject(new Error('aborted'));
    signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
  })},20);
  const start = performance.now();
  const context = await prepareContext({store,memory,userId:'alice',message:'SQLite',history:[],now,timezone:'UTC'});
  expect(context.retrieval.semantic).toBe('unavailable');
  expect(context.context).toContain('Local database');
  expect(performance.now()-start).toBeLessThan(1000);
});
test('ordinary French words are not silently treated as English weekday abbreviations', () => {
  expect(resolveDays('Quel moteur pour mon application hors ligne ?',now,'UTC')).toEqual([]);
  expect(resolveDays('What did I ask on Mon?',now,'UTC')).toHaveLength(2);
});

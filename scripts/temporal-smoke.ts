import 'dotenv/config';
import { MemoryStore } from '../src/memory/db.js';
import { buildContext } from '../src/context.js';
import { runAgent, type SearchEvent } from '../src/agent.js';
import { createExaProvider } from '../src/search/exa.js';
import { NOW, TIMEZONE, USER, seedHistory, mockSearch } from '../evals/fixtures.js';
import { temporalCases } from '../evals/cases.js';
const live = process.argv.includes('--live');
const selected = process.argv.find(arg => arg.startsWith('--case='))?.slice(7);
if (selected && !temporalCases.some(c => c.id === selected)) throw new Error('Unknown temporal case.');
let failed = 0;
for (const c of temporalCases.filter(c => (!selected || c.id === selected) && (!live || ['november-3', 'last-tuesday'].includes(c.id)))) {
  const store = new MemoryStore(':memory:');
  try {
    if (c.seeded) seedHistory(store);
    else if (c.id === 'november-3-no-history') seedHistory(store, true);
    const context = buildContext({ store, userId: USER, message: c.question, history: [], now: NOW, timezone: TIMEZONE });
    const events: SearchEvent[] = [];
    const observations: { query: string; since?: string; results: { url: string; publishedDate: string | null }[] }[] = [];
    const provider = live ? createExaProvider(process.env.EXA_API_KEY ?? '') : mockSearch();
    const start = performance.now();
    const result = runAgent({ ...context, now: NOW, timezone: TIMEZONE,
      onSearch: e => { events.push(e); console.error(JSON.stringify({ case: c.id, ...e })); },
      search: { search: async (query, options) => {
        const response = await provider.search(query, options);
        observations.push({ query, since: options?.since, results: response.results.map(r => ({ url: r.url, publishedDate: r.publishedDate })) });
        return response;
      } },
    });
    let text = '';
    for await (const part of result.fullStream) {
      if (part.type === 'error') throw part.error;
      if (part.type === 'text-delta') text += part.text;
    }
    const calls = events.filter(e => e.phase === 'start');
    const checks = c.seeded ? {
      entityCoverage: c.entities.every(entity => calls.some(e => e.query.toLowerCase().includes(entity))),
      pairedSearches: c.entities.every(entity => calls.some(e => e.query.toLowerCase().includes(entity) && e.since?.startsWith(c.since)) && calls.some(e => e.query.toLowerCase().includes(entity) && !e.since)),
      firstStepParallel: calls.filter(e => e.step === 1).length >= c.entities.length,
      citations: /\[\d+(?:\s*,\s*\d+)*\]/.test(text),
      date: /3\s*(?:Nov|November)|Nov(?:ember)?\s*3|2026-11-03/.test(text) || c.id === 'crm',
      baselineDifference: live || c.id === 'crm' || /\bchanged\b/i.test(text),
      currentUndatedPage: observations.some(o => !o.since && o.results.some(r => r.publishedDate === null)),
    } : { noSearches: calls.length === 0, honestNoHistory: /no |don.t have|can.t|cannot|which|record|history/i.test(text) };
    const pass = Object.values(checks).every(Boolean);
    if (!pass) failed++;
    console.log(JSON.stringify({ id: c.id, live, pass, checks, calls: calls.length, latencyMs: Math.round(performance.now() - start), observations, text }));
  } catch {
    failed++;
    console.log(JSON.stringify({ id: c.id, live, pass: false, error: 'Model or search run failed; inspect account access and connectivity.' }));
  } finally { store.close(); }
}
if (failed) process.exitCode = 1;

import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import type { ModelMessage } from 'ai';
import { MemoryStore } from '../src/memory/db.js';
import { buildContext } from '../src/context.js';
import { runAgent, DEFAULT_MODEL } from '../src/agent.js';
import { createExaProvider } from '../src/search/exa.js';
import { NOW, TIMEZONE, USER, seedHistory, mockSearch } from './fixtures.js';
import { evalCases } from './cases.js';
import { assertions, type EvalCall, type EvalEvidence } from './assertions.js';
const args = process.argv.slice(2);
const value = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const live = args.includes('--live');
const selected = value('case')?.split(',');
const repeat = Number(value('repeat') ?? 1);
const searchType = value('search-type') ?? 'auto';
const output = value('output');
const stepCap = Number(value('step-cap') ?? 4);
if (stepCap !== 2 && stepCap !== 4) throw new Error('step-cap must be 2 or 4.');
if (args.some(arg => arg !== '--live' && !/^--(?:case|repeat|search-type|step-cap|output)=.+/.test(arg))) throw new Error('Unknown eval option. Use --live, --case=ID, --repeat=N, --search-type=auto|fast, --output=PATH.');
if (selected?.some(id => !evalCases.some(c => c.id === id))) throw new Error('Unknown eval case.');
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) throw new Error('repeat must be from 1 to 10.');
if (searchType !== 'auto' && searchType !== 'fast') throw new Error('search-type must be auto or fast.');
if (!process.env.GEMINI_API_KEY?.trim()) throw new Error('GEMINI_API_KEY is required. Eval uses a real model with mock search by default.');
if (live && !process.env.EXA_API_KEY?.trim()) throw new Error('EXA_API_KEY is required with --live.');
const records = [];
for (let iteration = 1; iteration <= repeat; iteration++) for (const c of evalCases.filter(c => !selected || selected.includes(c.id))) {
  const store = new MemoryStore(':memory:');
  const calls: EvalCall[] = [];
  const sources: EvalEvidence[] = [];
  const searches: { query: string; since?: string; until?: string; startedMs: number; latencyMs: number; resultCount: number; failed: boolean }[] = [];
  const errors: string[] = [];
  // Adversarial fixtures must remain controlled even during a live-search run.
  const useLive = live && !['injection','failure','conflict'].includes(c.kind);
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  let firstStatusMs: number | null = null, firstSearchMs: number | null = null, firstTokenMs: number | null = null;
  let text = '', steps = 0, completed = false;
  let finishReason: string | null = null;
  let usage: unknown;
  try {
    if (c.seeded) seedHistory(store);
    else if (c.id === 'november-3-no-history') seedHistory(store,true);
    const history: ModelMessage[] = c.kind === 'follow-up' ? [
      { role: 'user', content: 'Compare Postgres hosting pricing on Neon, Supabase, and RDS.' },
      { role: 'assistant', content: 'Neon Launch uses usage-based pricing with no monthly minimum; Supabase Pro starts at $25/month; RDS depends on region, instance, storage and usage.' },
    ] : [];
    const context = buildContext({ store, userId: USER, message: c.question, history, now: NOW, timezone: TIMEZONE });
    const provider = useLive ? createExaProvider(process.env.EXA_API_KEY!, searchType) : mockSearch(c.kind);
    const result = runAgent({ ...context, now: NOW, timezone: TIMEZONE, maxSteps: stepCap, signal: AbortSignal.timeout(120000),
      onStep: step => { steps = step; },
      onStatus: () => { firstStatusMs ??= elapsed(); },
      onSearch: e => { if (e.phase === 'start') { firstSearchMs ??= elapsed(); calls.push({ query:e.query,since:e.since,until:e.until,step:e.step,atMs:elapsed() }); } },
      search: { search: async (query, filters) => {
        const log = { query, since: filters?.since, until: filters?.until, startedMs: elapsed(), latencyMs: 0, resultCount: 0, failed: false };
        const began = performance.now();
        try {
          const response = await provider.search(query,filters);
          log.resultCount = response.results.length;
          sources.push(...response.results.map(s=>({id:s.id,url:s.url,domain:s.domain,publishedDate:s.publishedDate})));
          return response;
        } catch (error) { log.failed = true; errors.push(query); throw error; }
        finally { log.latencyMs = Math.round(performance.now() - began); searches.push(log); }
      } },
    });
    for await (const part of result.fullStream) {
      if (part.type === 'error') throw part.error;
      if (part.type === 'text-delta') { firstTokenMs ??= elapsed(); text += part.text; }
    }
    steps = (await result.steps).length;
    finishReason = await result.finishReason;
    usage = await result.totalUsage;
    completed = true;
  } catch { errors.push('Model run failed or exceeded the 120-second eval timeout.'); }
  finally { store.close(); }
  const totalMs = elapsed();
  const checks = assertions(c,calls,text,sources,steps);
  checks.modelCompleted = completed;
  checks.notTruncated = finishReason !== 'length';
  checks.configuredStepBudget = steps <= stepCap;
  if (c.kind === 'failure') checks.injectedFailureObserved = errors.length > 0;
  const pass = Object.values(checks).every(Boolean);
  const record = { id:c.id, iteration, stepCap, backend:useLive ? 'exa' : 'mock', searchType:useLive ? searchType : null, pass, checks, steps,
    firstStatusMs, firstSearchMs, firstTokenMs, totalMs, finishReason, calls, searches, sources, errors, usage, text,
    targets: { statusUnder500: firstStatusMs !== null && firstStatusMs < 500, firstTokenUnder4000: firstTokenMs !== null && firstTokenMs < 4000, totalUnder10000: totalMs < 10000 },
  };
  records.push(record);
  console.error(`${c.id} ${iteration}/${repeat}: ${pass ? 'PASS' : 'FAIL'} (${totalMs} ms)${pass ? '' : ' — '+Object.entries(checks).filter(([,ok])=>!ok).map(([key])=>key).join(', ')}`);
}
console.table(records.map(r=>({case:r.id,run:r.iteration,backend:r.backend,result:r.pass?'PASS':'FAIL',steps:r.steps,searches:r.calls.length,statusMs:r.firstStatusMs,searchMs:r.firstSearchMs,tokenMs:r.firstTokenMs,totalMs:r.totalMs})));
const passed = records.filter(r=>r.pass).length;
console.log(`${passed}/${records.length} passed. Status is the local thinking event; searchMs and tokenMs include model latency. Latency targets are reported, not correctness gates.`);
if (output) await writeFile(output,JSON.stringify({ measuredAt:new Date().toISOString(), model:process.env.MODEL?.trim() || DEFAULT_MODEL, clock:NOW.toISOString(), records },null,2)+'\n');
if (passed !== records.length) process.exitCode = 1;

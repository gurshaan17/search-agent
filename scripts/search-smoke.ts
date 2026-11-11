import 'dotenv/config';
import { createExaProvider } from '../src/search/exa.js';
const queries = ['latest stable Node.js release', 'Neon Postgres pricing', 'Supabase new features', 'CRM pricing comparison', 'Postgres hosting announcements'];
let failures = 0;
for (const type of ['auto', 'fast'] as const) {
  for (const size of [600, 1200]) {
    const provider = createExaProvider(process.env.EXA_API_KEY ?? '', type, size);
    for (const query of queries) {
      const start = performance.now();
      try {
        const result = await provider.search(query);
        console.log(JSON.stringify({ type, size, query, status: 'ok', latencyMs: Math.round(performance.now() - start), ...result }));
      } catch (error) {
        failures++;
        const cause = error instanceof Error ? error.cause : undefined;
        const timedOut = cause instanceof Error && cause.name === 'TimeoutError'
          || error instanceof Error && error.name === 'TimeoutError';
        console.log(JSON.stringify({ type, size, query, status: timedOut ? 'timeout' : 'error', latencyMs: Math.round(performance.now() - start), error: timedOut ? 'Search exceeded the 8-second budget.' : 'Search failed; check connectivity and Exa account status.' }));
      }
    }
  }
}
console.log(JSON.stringify({ total: queries.length * 4, failures }));
if (failures) process.exitCode = 1;

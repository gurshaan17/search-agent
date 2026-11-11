import { expect, test } from 'vitest';
import { MemoryStore } from '../src/memory/db.js';
import { buildContext } from '../src/context.js';
import { NOW, TIMEZONE, USER, seedHistory, mockSearch } from './fixtures.js';
import { temporalCases } from './cases.js';
import { MockSearchProvider } from '../src/search/mock.js';

test('seeded temporal scenarios expose the right baselines; absent history is explicit', () => {
  for (const c of temporalCases) {
    const store = new MemoryStore(':memory:');
    try {
      if (c.seeded) seedHistory(store);
    else if (c.id === 'november-3-no-history') seedHistory(store, true);
      const context = buildContext({ store, userId: USER, message: c.question, history: [], now: NOW, timezone: TIMEZONE });
      if (!c.seeded) expect(context.context).toContain('(No matching prior turns.)');
      else if (c.id === 'crm') {
        for (const tool of ['HubSpot', 'Salesforce', 'Zoho CRM', 'Pipedrive', 'Freshsales']) expect(context.context).toContain(tool);
        expect(context.context).toContain('since=2026-11-09');
      } else {
        expect(context.context).toContain('Compare Postgres hosting');
        expect(context.context).toContain('since=2026-11-03');
        if (c.id === 'last-tuesday') expect(context.context.indexOf('Postgres')).toBeLessThan(context.context.indexOf('bread'));
      }
    } finally { store.close(); }
  }
});
test('publication filtering misses updated undated pricing, while the paired search finds it', async () => {
  const provider = mockSearch();
  const dated = await provider.search('Neon pricing changes', { since: '2026-11-03' });
  expect(dated.results).toEqual([]);
  expect(dated.note).toContain('publication dates only');
  const current = await provider.search('Neon official pricing', {});
  expect(current.results[0].publishedDate).toBeNull();
  expect(current.results[0].highlights.join(' ')).toContain('no monthly minimum');
});
test('date-filter note is part of the shared provider contract', async () => {
  const p = new MockSearchProvider({});
  expect((await p.search('x', { until: '2026-11-03' })).note).toContain('publication dates only');
  expect((await p.search('x')).note).toBeUndefined();
});

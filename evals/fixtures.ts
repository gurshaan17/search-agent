import type { MemoryStore } from '../src/memory/db.js';
import { MockSearchProvider } from '../src/search/mock.js';
export const NOW = new Date('2026-11-11T04:30:00Z');
export const TIMEZONE = 'Asia/Kolkata';
export const USER = 'temporal-eval';
export function seedHistory(store: MemoryStore, omitPostgres = false) {
  const records = [
    ['2026-11-03T04:30:00Z', 'Compare Postgres hosting pricing on Neon, Supabase, and RDS.', 'Neon Launch starts at $19/month; Supabase Pro at $25/month; Amazon RDS pricing depends on instance, region, storage and usage.'],
    ['2026-11-09T04:30:00Z', 'Shortlist five CRM tools and compare pricing and features.', 'Our five CRM tools are HubSpot, Salesforce, Zoho CRM, Pipedrive, and Freshsales. Starting monthly seat prices: HubSpot $20, Salesforce $25, Zoho CRM $20, Pipedrive $24, Freshsales $11. These are baseline observations, not guaranteed current prices.'],
    ['2026-11-10T04:30:00Z', 'How do I bake bread?', 'Mix flour, water, yeast and salt.'],
  ];
  for (const [created_at, question, answer] of records) {
    if (omitPostgres && created_at.startsWith('2026-11-03')) continue;
    const base = { user_id: USER, conversation_id: created_at, created_at, tz: TIMEZONE };
    store.saveTurn({ ...base, role: 'user', content: question });
    store.saveTurn({ ...base, role: 'assistant', content: answer });
  }
}
// Synthetic observations deliberately differ from historical baselines; these are not live claims.
export function mockSearch() {
  const entities = [
    ['hubspot', 'https://www.hubspot.com/pricing', 'HubSpot Starter is $20 per seat monthly.'],
    ['salesforce', 'https://www.salesforce.com/sales/pricing/', 'Salesforce Starter is $25 per seat monthly.'],
    ['zoho', 'https://www.zoho.com/crm/zohocrm-pricing.html', 'Zoho CRM Standard is $20 per seat monthly.'],
    ['pipedrive', 'https://www.pipedrive.com/en/pricing', 'Pipedrive entry plan is $24 per seat monthly.'],
    ['freshsales', 'https://www.freshworks.com/crm/sales/pricing/', 'Freshsales entry plan is $11 per seat monthly.'],
    ['neon', 'https://neon.com/pricing', 'Neon Launch now uses usage-based pricing with no monthly minimum, replacing the previously stated $19 starting price.'],
    ['supabase', 'https://supabase.com/pricing', 'Supabase Pro starts at $25/month, excluding additional usage.'],
    ['rds', 'https://aws.amazon.com/rds/pricing/', 'Amazon RDS pricing depends on instance, region, storage and usage.'],
    ['amazon', 'https://aws.amazon.com/rds/pricing/', 'Amazon RDS pricing depends on instance, region, storage and usage.'],
  ];
  const provider = new MockSearchProvider(Object.fromEntries(entities.map(([name, url, text]) => [name, [{ url, title: `${name} official pricing`, publishedDate: null, highlights: [text] }]])));
  return { search: async (query: string, options: Parameters<typeof provider.search>[1]) => {
    // Simulate updated pricing pages with no publication date: dated news searches miss them.
    if (options?.since || options?.until) return { searchedAt: NOW.toISOString(), results: [], note: 'Date filters match publication dates only; also check current official pages without date filters.' };
    return provider.search(query, options);
  } };
}

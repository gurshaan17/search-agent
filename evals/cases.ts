export const temporalCases = [
  { id: 'crm', seeded: true, question: 'On Monday we shortlisted 5 CRM tools. Has any changed pricing or shipped something big since?', entities: ['hubspot', 'salesforce', 'zoho', 'pipedrive', 'freshsales'], since: '2026-11-09' },
  { id: 'crm-no-history', seeded: false, question: 'On Monday we shortlisted 5 CRM tools. Has any changed pricing or shipped something big since?', entities: [], since: '' },
  { id: 'november-3', seeded: true, question: 'What did I ask you on 3 November? Is your answer still correct today?', entities: ['neon', 'supabase', 'rds'], since: '2026-11-03' },
  { id: 'november-3-no-history', seeded: false, question: 'What did I ask you on 3 November? Is your answer still correct today?', entities: [], since: '' },
  { id: 'last-tuesday', seeded: true, question: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?', entities: ['neon', 'supabase', 'rds'], since: '2026-11-03' },
];

export const evalCases = [
  ...temporalCases.map(c => ({ ...c, kind: 'temporal' })),
  { id: 'latest-node', kind: 'latest', seeded: false, question: "What's the latest stable Node.js release?", entities: ['node'], since: '' },
  { id: 'hosting-comparison', kind: 'comparison', seeded: false, question: 'Compare current Postgres hosting pricing on Neon, Supabase, and RDS.', entities: ['neon', 'supabase', 'rds'], since: '' },
  { id: 'cap', kind: 'timeless', seeded: false, question: 'Explain the CAP theorem.', entities: [], since: '' },
  { id: 'follow-up', kind: 'follow-up', seeded: false, question: 'And what about Neon specifically?', entities: ['neon'], since: '' },
  { id: 'injection', kind: 'injection', seeded: false, question: "What's the latest stable Node.js release?", entities: ['node'], since: '' },
  { id: 'partial-failure', kind: 'failure', seeded: false, question: 'Compare current Neon and Supabase pricing.', entities: ['neon', 'supabase'], since: '' },
  { id: 'conflicting-prices', kind: 'conflict', seeded: false, question: 'What does the Neon Launch plan cost today?', entities: ['neon'], since: '' },
];
export type EvalCase = typeof evalCases[number];

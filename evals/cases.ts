export const temporalCases = [
  { id: 'crm', seeded: true, question: 'On Monday we shortlisted 5 CRM tools. Has any changed pricing or shipped something big since?', entities: ['hubspot', 'salesforce', 'zoho', 'pipedrive', 'freshsales'], since: '2026-11-09' },
  { id: 'crm-no-history', seeded: false, question: 'On Monday we shortlisted 5 CRM tools. Has any changed pricing or shipped something big since?', entities: [], since: '' },
  { id: 'november-3', seeded: true, question: 'What did I ask you on 3 November? Is your answer still correct today?', entities: ['neon', 'supabase', 'rds'], since: '2026-11-03' },
  { id: 'november-3-no-history', seeded: false, question: 'What did I ask you on 3 November? Is your answer still correct today?', entities: [], since: '' },
  { id: 'last-tuesday', seeded: true, question: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?', entities: ['neon', 'supabase', 'rds'], since: '2026-11-03' },
];

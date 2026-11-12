import type { MemoryStore } from '../src/memory/db.js';
export const memoryCases = [
  { id:'paraphrase',question:'What storage engine did you suggest for my offline desktop tool?',expected:'database' },
  { id:'translation',question:'What did you tell me about making bread?',expected:'spanish' },
  { id:'language',question:'did you ever reply to me in punjabi across any session',expected:'greeting' },
  { id:'assistant-only',question:'Have you ever recommended a relational database?',expected:'database' },
  { id:'weekday',question:'Last Tuesday we discussed a database for a local application. What was your advice?',expected:'database' },
  { id:'explicit-date',question:'What did I ask on 10 November?',expected:'dinner' },
  { id:'correction',question:'What is your corrected recommendation for hosting the database?',expected:'correction' },
  { id:'french-query',question:'Quel moteur avais-tu conseillé pour conserver les données de mon application hors ligne ?',expected:'database' },
  { id:'dinner',question:'Was the dish you suggested a soup or a sandwich?',expected:'dinner' },
  { id:'revision',question:'Was the original cloud hosting recommendation later revised?',expected:'correction' },
  { id:'absent-heldout',question:'What did you tell me about the composition of Saturn’s rings?',expected:null },
  { id:'absent',question:'What did we decide about the telescope lens coating?',expected:null },
];
export function seedMemoryCases(store: MemoryStore, userId: string) {
  const rows = [
    ['database','2026-11-03','Help me choose something for this offline desktop app.','SQLite is the relational database I recommend. It stores data locally in a single file and works without a server.'],
    ['spanish','2026-11-04','¿Cómo preparo pan casero?','Mezcla harina, agua, levadura y sal. Amasa, deja fermentar y hornea hasta que esté dorado.'],
    ['greeting','2026-11-05','Say hello','ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਤੁਹਾਡਾ ਦਿਨ ਚੰਗਾ ਲੰਘੇ।'],
    ['hosting','2026-11-06','Which Postgres hosting service should we choose?','Use Neon for the managed database.'],
    ['correction','2026-11-07','Please correct the hosting recommendation for our compliance requirement.','Correction: use Amazon RDS instead of Neon because you require deployment in your existing AWS account.'],
    ['dinner','2026-11-10','What can I cook tonight?','Make vegetable soup for dinner.'],
    ['distractor','2026-11-10','What languages could we use later?','We could discuss Punjabi or Spanish in a future session. This is a suggestion, not a previous reply in those languages.'],
  ];
  const ids: Record<string,number> = {};
  for (const [id,day,question,answer] of rows) {
    const base = { user_id:userId,conversation_id:id,created_at:`${day}T04:30:00Z`,tz:'UTC' };
    ids[id] = store.saveTurn({ ...base,role:'user',content:question });
    store.saveTurn({ ...base,role:'assistant',content:answer });
  }
  return ids;
}

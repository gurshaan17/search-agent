import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from './db.js';
import { recall, retrieve, resolveDay } from './recall.js';
import { buildContext } from '../context.js';
const now = new Date('2026-11-11T04:30:00Z');
const tz = 'Asia/Kolkata';
const stores: MemoryStore[] = [];
const dirs: string[] = [];
function open(path = ':memory:') { const s = new MemoryStore(path); stores.push(s); return s; }
afterEach(() => { for (const s of stores.splice(0)) s.close(); for (const d of dirs.splice(0)) rmSync(d, { recursive: true }); });
function pair(s: MemoryStore, question: string, date: string, user = 'alice', conversation = 'old') {
  const base = { user_id: user, conversation_id: conversation, created_at: date, tz };
  const id = s.saveTurn({ ...base, role: 'user', content: question });
  const answer = s.saveTurn({ ...base, role: 'assistant', content: 'Saved answer ' + 'x'.repeat(2500) });
  s.saveEvidence(answer, [{ id: 's1', title: 'Official', url: 'https://example.com', domain: 'example.com', publishedDate: null, highlights: [] }], [{ query: question, resultCount: 1, latencyMs: 12 }], date);
  return id;
}
test('explicit local day uses half-open UTC bounds', () => {
  expect(resolveDay('What did I ask on 3 November?', now, tz)).toEqual({ day: '2026-11-03', start: '2026-11-02T18:30:00.000Z', end: '2026-11-03T18:30:00.000Z' });
});
test('relative weekdays resolve into the past, including a bare future weekday', () => {
  for (const phrase of ['last Tuesday', 'on Monday', 'Friday']) expect(resolveDay(phrase, now, tz)!.start < now.toISOString()).toBe(true);
  expect(resolveDay('on Monday', now, tz)?.day).toBe('2026-11-09');
});
test('local day respects daylight saving rather than adding 24 hours', () => {
  const range = resolveDay('1 November 2026', now, 'America/New_York')!;
  expect(range.start).toBe('2026-11-01T04:00:00.000Z');
  expect(range.end).toBe('2026-11-02T05:00:00.000Z');
});
test('topic matching within seven days ranks Postgres over unrelated date hits', () => {
  const s = open();
  pair(s, 'Postgres hosting pricing', '2026-11-03T04:30:00Z');
  pair(s, 'Baking bread', '2026-11-10T04:30:00Z');
  const data = recall(s, 'alice', 'Last Tuesday I asked about Postgres hosting. Has pricing changed?', now, tz).split('\n').map(line => JSON.parse(line));
  expect(data[0].question).toBe('Postgres hosting pricing');
  expect(data[0].answer).toHaveLength(2000);
  expect(data[0].sources[0].url).toBe('https://example.com');
  expect(data[0].hint).toContain('since=2026-11-03');
});
test('recall crosses conversations for the same user and isolates other users', () => {
  const s = open(); pair(s, 'Neon Postgres pricing', '2026-11-03T04:30:00Z');
  pair(s, 'private Postgres information', '2026-11-03T04:30:00Z', 'bob');
  const context = buildContext({ store: s, userId: 'alice', message: 'Postgres', history: [], now, timezone: tz });
  expect(context.context).toContain('Neon Postgres pricing');
  expect(context.context).not.toContain('private');
  expect(context.messages).toEqual([{ role: 'user', content: 'Postgres' }]);
});
test('no matching turn returns empty recall, not fabricated history', () => {
  expect(recall(open(), 'alice', 'on 3 November', now, tz)).toBe('');
});
test('range excludes the next midnight and does not pair a failed user turn with another answer', () => {
  const s = open();
  const base = { user_id: 'alice', conversation_id: 'c', tz };
  s.saveTurn({ ...base, role: 'user', content: 'failed', created_at: '2026-11-02T18:30:00Z' });
  pair(s, 'next', '2026-11-03T18:30:00Z', 'alice', 'c');
  const turns = s.turnsInRange('alice', '2026-11-02T18:30:00.000Z', '2026-11-03T18:30:00.000Z');
  expect(turns).toHaveLength(1); expect(s.reply(turns[0])).toBeUndefined();
});
test('database creates parent directories, survives reopen, and maintains FTS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'search-memory-')); dirs.push(dir);
  const path = join(dir, 'nested', 'chat.sqlite');
  const s = new MemoryStore(path); pair(s, 'Postgres hosting', '2026-11-03T04:30:00Z'); s.close();
  const reopened = open(path);
  expect(reopened.keywordTurns('alice', ['postgres'])).toHaveLength(1);
  expect(reopened.keywordTurns('bob', ['postgres'])).toHaveLength(0);
  expect(reopened.keywordTurns('alice', ['" OR *'])).toHaveLength(0);
});

test('recalls an assistant-only topic with its original question across sessions', () => {
  const s = open();
  const base = { user_id: 'alice', conversation_id: 'previous', created_at: '2026-11-01T00:00:00Z', tz };
  s.saveTurn({ ...base, role: 'user', content: 'Which option should I use?' });
  s.saveTurn({ ...base, role: 'assistant', content: 'Choose SQLite for this local app.' });
  const result = recall(s, 'alice', 'What did you say about SQLite?', now, tz);
  expect(result).toContain('Choose SQLite');
  expect(result).toContain('Which option should I use?');
});
test('finds Gurmukhi replies for an English Punjabi question, ahead of keyword distractions', () => {
  const s = open();
  const base = { user_id: 'alice', conversation_id: 'previous', created_at: '2026-11-01T00:00:00Z', tz };
  s.saveTurn({ ...base, role: 'user', content: 'Say hello' });
  s.saveTurn({ ...base, role: 'assistant', content: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ!' });
  for (let i = 0; i < 8; i++) pair(s, 'Did you ever reply in Punjabi across any session?', '2026-11-02T00:00:00Z', 'alice', `noise-${i}`);
  const result = retrieve(s, 'alice', 'did you ever reply to me in punjabi across any session', now, tz, { status: 'ready', latencyMs: 0, hits: [{ questionId: 1, answerId: 2, score: 0.95, role: 'assistant', start: 0, text: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ!' }] }).text;
  expect(JSON.parse(result.split('\n')[0]).answer).toBe('ਸਤ ਸ੍ਰੀ ਅਕਾਲ!');
  expect(result.split('\n').length).toBeLessThanOrEqual(6);
  expect(recall(s, 'bob', 'Punjabi', now, tz)).toBe('');
});
test('does not recall future assistant replies, including language matches', () => {
  const s = open();
  const base = { user_id: 'alice', conversation_id: 'previous', tz };
  s.saveTurn({ ...base, role: 'user', content: 'Punjabi greeting', created_at: '2026-11-01T00:00:00Z' });
  s.saveTurn({ ...base, role: 'assistant', content: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! SQLite', created_at: '2026-12-01T00:00:00Z' });
  expect(recall(s, 'alice', 'Punjabi SQLite', now, tz)).not.toContain('ਸਤ');
});
test('dated language recall finds older replies and retains matching text beyond the excerpt cap', () => {
  const s = open();
  const save = (date: string, answer: string, conversation: string) => {
    const base = { user_id: 'alice', conversation_id: conversation, created_at: date, tz };
    s.saveTurn({ ...base, role: 'user', content: 'Say hello' });
    s.saveTurn({ ...base, role: 'assistant', content: answer });
  };
  save('2026-11-01T00:00:00Z', 'x'.repeat(2500) + ' ਸਤ ਸ੍ਰੀ ਅਕਾਲ!', 'old');
  for (let i = 0; i < 8; i++) save('2026-11-10T00:00:00Z', 'ਨਮਸਤੇ', `new-${i}`);
  const data = retrieve(s, 'alice', 'Did you reply in Punjabi on 1 November?', now, tz, { status: 'ready', latencyMs: 0, hits: [{ questionId: 1, answerId: 2, score: 0.95, role: 'assistant', start: 2400, text: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ!' }] }).text.split('\n').map(line => JSON.parse(line));
  expect(data[0].answer).toContain('ਸਤ ਸ੍ਰੀ ਅਕਾਲ!');
  expect(data[0].answerIsExcerpt).toBe(true);
  expect(data[0].answer.length).toBeLessThanOrEqual(2000);
});
test('assistant matches pair only inside the same owner and conversation', () => {
  const s = open();
  const base = { created_at: '2026-11-01T00:00:00Z', tz };
  s.saveTurn({ ...base, user_id: 'alice', conversation_id: 'a', role: 'user', content: 'Choose a database' });
  s.saveTurn({ ...base, user_id: 'bob', conversation_id: 'a', role: 'user', content: 'Private question' });
  s.saveTurn({ ...base, user_id: 'alice', conversation_id: 'b', role: 'user', content: 'Unrelated question' });
  s.saveTurn({ ...base, user_id: 'alice', conversation_id: 'a', role: 'assistant', content: 'SQLite is suitable.' });
  const result = recall(s, 'alice', 'SQLite', now, tz);
  expect(result).toContain('Choose a database');
  expect(result).not.toMatch(/Private|Unrelated/);
  expect(recall(s, 'bob', 'SQLite', now, tz)).toBe('');
});
test('embedding cache persists alongside old conversations and can be replaced without altering them', () => {
  const dir = mkdtempSync(join(tmpdir(),'search-index-')); dirs.push(dir);
  const path = join(dir,'chat.sqlite');
  const s = new MemoryStore(path);
  const id = pair(s,'Saved question','2026-11-03T04:30:00Z');
  const question = s.turn('alice',id)!;
  const answer = s.reply(question)!;
  s.saveMemory({question,answer},'v1',[{role:'assistant',start:0,text:'Saved answer',vector:[1,0]}]);
  s.close();
  const reopened = open(path);
  expect([...reopened.memoryChunks('alice',now.toISOString(),'v1')]).toHaveLength(1);
  expect([...reopened.memoryChunks('bob',now.toISOString(),'v1')]).toHaveLength(0);
  expect([...reopened.memoryChunks('alice',now.toISOString(),'v2')]).toHaveLength(0);
  expect(reopened.pendingExchanges('alice',now.toISOString(),'v2')).toHaveLength(1);
  expect(reopened.reply(reopened.turn('alice',id)!)!.content).toBe(answer.content);
  expect(reopened.sources(answer.id)).toHaveLength(1);
});

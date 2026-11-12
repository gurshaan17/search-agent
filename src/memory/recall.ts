import * as chrono from 'chrono-node';
import type { MemoryStore, Turn } from './db.js';
import type { SemanticResult } from './semantic.js';

export function localDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function offset(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(date);
  const value = parts.find(p => p.type === 'timeZoneName')!.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(value);
  return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
}
function midnight(day: string, timezone: string): Date {
  const wall = Date.parse(`${day}T00:00:00Z`);
  let utc = wall;
  // Recompute the offset at the target date, including daylight-saving transitions.
  for (let i = 0; i < 4; i++) utc = wall - offset(new Date(utc), timezone) * 60000;
  return new Date(utc);
}
function parseDay(message: string, now: Date, timezone: string) {
  const parsed = chrono.parse(message, { instant: now, timezone: offset(now, timezone) }, { forwardDate: false })[0];
  if (!parsed) return undefined;
  // Bare abbreviations are ordinary words in other languages (French "mon" is "my").
  if (/^(?:mon|tue|wed|thu|fri|sat|sun)\.?$/i.test(parsed.text.trim()) && message.trim() !== parsed.text.trim()
    && !/\b(?:on|last|this|next)\s*$/i.test(message.slice(0,parsed.index))) return undefined;
  const c = parsed.start;
  let wall = new Date(Date.UTC(c.get('year')!, c.get('month')! - 1, c.get('day')!));
  const today = localDate(now, timezone);
  if (c.isCertain('weekday') && !c.isCertain('day') && !/\bnext\b/i.test(parsed.text)) {
    while (wall.toISOString().slice(0, 10) > today) wall.setUTCDate(wall.getUTCDate() - 7);
  }
  const day = wall.toISOString().slice(0, 10);
  wall.setUTCDate(wall.getUTCDate() + 1);
  return { day, start: midnight(day, timezone).toISOString(), end: midnight(wall.toISOString().slice(0, 10), timezone).toISOString(), weekday: c.isCertain('weekday') && !c.isCertain('day') && !/\b(?:next|this)\b/i.test(parsed.text) };
}
export function resolveDay(message: string, now: Date, timezone: string) {
  const parsed = parseDay(message,now,timezone);
  if (!parsed) return undefined;
  const { weekday, ...range } = parsed;
  return range;
}
export function resolveDays(message: string, now: Date, timezone: string) {
  const parsed = parseDay(message,now,timezone);
  if (!parsed) return [];
  const { weekday, ...range } = parsed;
  if (!weekday) return [range];
  const dates = [range];
  // Weekday ambiguity is two calendar weeks, not an arbitrary ±7-day topic window.
  for (const delta of [-7,7]) {
    const d = new Date(`${range.day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    const day = d.toISOString().slice(0,10);
    if (day > localDate(now,timezone)) continue;
    d.setUTCDate(d.getUTCDate() + 1);
    dates.push({ day, start: midnight(day,timezone).toISOString(), end: midnight(d.toISOString().slice(0,10),timezone).toISOString() });
  }
  return dates.slice(0,2);
}
const stopwords = new Set('i me my we you your our on in at the a an and or of for to about what did ask asked tell told last this is was are were has have had any changed since then still correct today yesterday monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december please earlier ever reply replied respond responded say said across session sessions conversation conversations chat chats which when before recommended recommend recommendation previously'.split(' '));
export function keywords(message: string) {
  return [...new Set((message.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).filter(w => w.length > 2 && !stopwords.has(w)))].slice(0,16);
}
export interface Baseline { id: number; questionId: number; question: string; answer: string; answeredAt: string; since: string }
export interface RecallResult { text: string; baselines: Baseline[]; dates: ReturnType<typeof resolveDays>; ambiguous: boolean; semantic: SemanticResult['status']; selectedIds: number[] }
export function retrieve(store: MemoryStore, userId: string, message: string, now: Date, timezone: string, semantic?: SemanticResult, excludeQuestionId?: number): RecallResult {
  const dates = resolveDays(message,now,timezone);
  const words = keywords(message);
  const before = now.toISOString();
  const candidates = new Map<number, { question: Turn; answer?: Turn; lexical: number; semantic: number; start: number }>();
  const eligible = (t: Turn) => t.created_at <= before && (!dates.length || dates.some(d => t.created_at >= d.start && t.created_at < d.end));
  const add = (turn: Turn) => {
    const question = turn.role === 'user' ? turn : store.question(turn);
    if (!question || question.id === excludeQuestionId || !eligible(question)) return;
    let answer = turn.role === 'assistant' ? turn : store.reply(turn);
    if (answer && answer.created_at > before) answer = undefined;
    if (!candidates.has(question.id)) candidates.set(question.id,{ question, answer, lexical: 0, semantic: 0, start: 0 });
    return candidates.get(question.id)!;
  };
  for (const t of store.keywordTurns(userId,words,before)) {
    const c = add(t);
    if (!c) continue;
    const tokens = new Set((c.question.content + ' ' + (c.answer?.content ?? '')).toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu));
    c.lexical = words.filter(w => tokens.has(w)).length / Math.max(1,words.length);
  }
  for (const hit of semantic?.hits ?? []) {
    // A similarity is evidence of relevance, never proof of an historical fact.
    if (hit.score < 0.68) continue;
    const t = store.turn(userId,hit.answerId);
    if (!t || t.created_at > before) continue;
    const c = add(t);
    if (!c) continue;
    c.semantic = hit.score;
    if (hit.role === 'assistant') c.start = hit.start;
  }
  for (const d of dates) for (const t of store.turnsInRange(userId,d.start,d.end)) add(t);
  const score = (c: { lexical: number; semantic: number }) => c.semantic ? c.semantic + c.lexical * 0.04 : c.lexical * 0.4;
  const ranked = [...candidates.values()].sort((a,b) => score(b) - score(a) || b.question.created_at.localeCompare(a.question.created_at) || b.question.id - a.question.id).slice(0,6);
  const ambiguous = dates.length > 1 && ranked.length > 1 && score(ranked[0]) - score(ranked[1]) < 0.06 && localDate(new Date(ranked[0].question.created_at),timezone) !== localDate(new Date(ranked[1].question.created_at),timezone);
  const baselines: Baseline[] = [];
  const text = ranked.map(c => {
    const { question, answer } = c;
    if (answer && !answer.content.endsWith('[Generation interrupted.]')) baselines.push({ id: answer.id, questionId: question.id, question: question.content.slice(0,2000), answer: answer.content.slice(0,12000), answeredAt: answer.created_at, since: localDate(new Date(answer.created_at),timezone) });
    const display = (stamp: string) => new Intl.DateTimeFormat('en-GB', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(stamp));
    return JSON.stringify({ questionId: question.id, answerId: answer?.id, askedAt: display(question.created_at), timezone,
      question: question.content.slice(0,2000), answer: answer?.content.slice(c.start,c.start + 2000) ?? null,
      answerIsExcerpt: !!answer && (c.start > 0 || answer.content.length > 2000),
      relevance: { lexical: c.lexical, semantic: c.semantic, strength: c.lexical >= 0.5 || c.semantic >= 0.74 ? 'strong' : dates.length && !words.length ? 'date-only' : 'weak' },
      nearbyTurns: store.nearbyTurns(question, before).map(t => ({ role: t.role, at: t.created_at, content: t.content.slice(0,500) })),
      sources: answer ? store.sources(answer.id) : [],
      hint: answer ? `Prior answer given at ${answer.created_at}; use since=${localDate(new Date(answer.created_at),timezone)} for change checks.` : 'No saved assistant reply.',
    });
  }).join('\n');
  return { text, baselines, dates, ambiguous, semantic: semantic?.status ?? 'disabled', selectedIds: ranked.map(c => c.question.id) };
}
export function recall(store: MemoryStore, userId: string, message: string, now: Date, timezone: string): string {
  return retrieve(store,userId,message,now,timezone).text;
}

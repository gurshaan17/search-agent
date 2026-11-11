import * as chrono from 'chrono-node';
import type { MemoryStore } from './db.js';

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
export function resolveDay(message: string, now: Date, timezone: string) {
  const parsed = chrono.parse(message, { instant: now, timezone: offset(now, timezone) }, { forwardDate: false })[0];
  if (!parsed) return undefined;
  const c = parsed.start;
  let wall = new Date(Date.UTC(c.get('year')!, c.get('month')! - 1, c.get('day')!));
  const today = localDate(now, timezone);
  if (c.isCertain('weekday') && !c.isCertain('day') && !/\bnext\b/i.test(parsed.text)) {
    while (wall.toISOString().slice(0, 10) > today) wall.setUTCDate(wall.getUTCDate() - 7);
  }
  const day = wall.toISOString().slice(0, 10);
  wall.setUTCDate(wall.getUTCDate() + 1);
  return { day, start: midnight(day, timezone).toISOString(), end: midnight(wall.toISOString().slice(0, 10), timezone).toISOString() };
}
const stopwords = new Set('i me my we you your our on in at the a an and or of for to about what did ask asked tell told last this is was are were has have had any changed since then still correct today yesterday monday tuesday wednesday thursday friday saturday sunday november please earlier'.split(' '));
export function recall(store: MemoryStore, userId: string, message: string, now: Date, timezone: string): string {
  const range = resolveDay(message, now, timezone);
  const words = [...new Set((message.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(w => w.length > 2 && !stopwords.has(w)))].slice(0, 16);
  const keywords = store.keywordTurns(userId, words).filter(t => t.created_at <= now.toISOString());
  const dated = range ? store.turnsInRange(userId, range.start, range.end).filter(t => t.created_at <= now.toISOString()) : [];
  const nearby = range ? keywords.filter(t => Math.abs(Date.parse(t.created_at) - Date.parse(range.start)) <= 7 * 86400000) : keywords;
  const candidates = [...new Map([...nearby, ...dated].map(t => [t.id, t])).values()].slice(0, 6);
  if (!candidates.length) return '';
  return candidates.map(t => {
    const answer = store.reply(t);
    const display = (stamp: string) => new Intl.DateTimeFormat('en-GB', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(stamp));
    return JSON.stringify({ askedAt: display(t.created_at), timezone, question: t.content.slice(0, 2000), answer: answer?.content.slice(0, 2000) ?? null,
      sources: answer ? store.sources(answer.id) : [],
      hint: answer ? `Prior answer given at ${answer.created_at}; use since=${localDate(new Date(answer.created_at), timezone)} for change checks.` : 'No saved assistant reply.',
    });
  }).join('\n');
}

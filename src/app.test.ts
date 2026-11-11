import { afterEach, expect, test } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { simulateReadableStream } from 'ai';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { createApp } from './app.js';
import { MemoryStore } from './memory/db.js';
const stores: MemoryStore[] = [];
afterEach(() => { for (const s of stores.splice(0)) s.close(); });
function store() { const s = new MemoryStore(':memory:'); stores.push(s); return s; }
const request = (message = 'Latest release', userId = 'alice') => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, userId, conversationId: 'c', timezone: 'Asia/Kolkata' }) });
function model(search = true) {
  let step = 0;
  return new MockLanguageModelV3({ doStream: async () => {
    const call = search && step++ === 0;
    const chunks: LanguageModelV3StreamPart[] = call ? [{ type: 'tool-call', toolName: 'web_search', toolCallId: 'search', input: '{"query":"Node latest"}' }] : [
      { type: 'text-start', id: 'a' }, { type: 'text-delta', id: 'a', delta: 'Evidence ' }, { type: 'text-delta', id: 'a', delta: '[1]' }, { type: 'text-end', id: 'a' },
    ];
    chunks.push({ type: 'finish', finishReason: { unified: call ? 'tool-calls' : 'stop', raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } } });
    return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 0 }) };
  } });
}
function frames(text: string) { return text.trim().split('\n\n').map(frame => ({ event: frame.split('\n').find(l => l.startsWith('event:'))?.slice(6).trim(), data: JSON.parse(frame.split('\n').find(l => l.startsWith('data:'))!.slice(5)) })); }
test('POST streams ordered status, sources, deltas and done, then persists reply and evidence', async () => {
  const s = store(); const m = model();
  const app = createApp({ store: s, model: m, search: () => ({ search: async () => ({ searchedAt: new Date().toISOString(), results: [{ id: 's1', title: 'Node', url: 'https://nodejs.org', domain: 'nodejs.org', publishedDate: null, highlights: ['release'] }] }) }) });
  const response = await app.request('/chat', request());
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  const events = frames(await response.text());
  expect(events.map(e => e.event)).toEqual(['status','status','sources','text','text','done']);
  expect(events[1].data.query).toBe('Node latest');
  expect(events[2].data.sources[0].n).toBe(1);
  expect(events.at(-1)?.data.searches[0].resultCount).toBe(1);
  const turns = s.conversationTurns('alice','c');
  expect(turns.map(t => t.content)).toEqual(['Latest release','Evidence [1]']);
  expect(s.sources(turns[1].id)[0].url).toBe('https://nodejs.org');
  expect(s.conversationTurns('bob','c')).toEqual([]);
  await (await app.request('/chat',request('What did I ask earlier?'))).text();
  expect(JSON.stringify(m.doStreamCalls.at(-1)?.prompt)).toContain('Latest release');
});
test('invalid bodies and timezones fail before generating or writing memory', async () => {
  const s = store(); const app = createApp({ store:s, search:()=>({search:async()=>{throw new Error('must not execute');}}) });
  expect((await app.request('/chat',{method:'POST',body:'bad'})).status).toBe(400);
  const bad = request(); bad.body = JSON.stringify({ message:'x',userId:'alice',conversationId:'c',timezone:'invalid' });
  expect((await app.request('/chat',bad)).status).toBe(400);
  expect(s.conversationTurns('alice','c')).toEqual([]);
});
test('stream errors expose a generic error and never emit done', async () => {
  const s=store(); const m=new MockLanguageModelV3({doStream:async()=>{throw new Error('SECRET-provider-detail');}});
  const app=createApp({store:s,model:m,search:()=>({search:async()=>({searchedAt:'',results:[]})})});
  const output=await (await app.request('/chat',request())).text();
  expect(output).toContain('event: error');expect(output).not.toContain('SECRET');expect(output).not.toContain('event: done');
  expect(s.conversationTurns('alice','c')).toHaveLength(1);
});
test('disconnect aborts an active search and a conversation rejects overlapping turns', async () => {
  const s=store(); const controller=new AbortController();
  let began!:()=>void; const started=new Promise<void>(resolve=>{began=resolve;});
  let finished!:()=>void; const stopped=new Promise<void>(resolve=>{finished=resolve;});
  const app=createApp({store:s,model:model(),search:()=>({search:async (_query,options)=>{
    began();return new Promise((_,reject)=>options?.signal?.addEventListener('abort',()=>{finished();reject(new Error('cancelled'));},{once:true}));
  }})});
  const response=await app.request('/chat',{...request(),signal:controller.signal});
  const consuming=response.text();
  await started;
  expect((await app.request('/chat',request('overlap'))).status).toBe(409);
  controller.abort();await stopped;await consuming;
  expect(s.conversationTurns('alice','c')).toHaveLength(1);
});

import { afterEach, expect, test, vi } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { simulateReadableStream } from 'ai';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { createApp } from './app.js';
import { MemoryStore } from './memory/db.js';
const stores: MemoryStore[] = [];
afterEach(() => { for (const s of stores.splice(0)) s.close(); vi.restoreAllMocks(); });
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

function answerModel(answer: string, reason: 'stop' | 'length' = 'stop') {
  let round=0;
  return new MockLanguageModelV3({ doStream: async () => {
    const searching=round++===0;
    const chunks: LanguageModelV3StreamPart[]=searching ? [{type:'tool-call',toolCallId:'q',toolName:'web_search',input:'{"query":"Node latest SECRET-query"}'}] : [
      {type:'text-start',id:'a'}, ...Array.from(answer).map(delta=>({type:'text-delta' as const,id:'a',delta})), {type:'text-end',id:'a'},
    ];
    chunks.push({type:'finish',finishReason:{unified:searching?'tool-calls':reason,raw:undefined},usage:{inputTokens:{total:3,noCache:3,cacheRead:0,cacheWrite:0},outputTokens:{total:2,text:2,reasoning:0}}});
    return {stream:simulateReadableStream({chunks,chunkDelayInMs:0})};
  } });
}
const evidence = () => ({search:async()=>({searchedAt:new Date().toISOString(),results:[{id:'s1',title:'Node',url:'https://nodejs.org',domain:'nodejs.org',publishedDate:null,highlights:['release']} ]})});
test('validates citations before streaming and persistence; turn logs exclude private strings', async () => {
  const s=store();const logs: unknown[]=[];
  const app=createApp({store:s,model:answerModel('Evidence [1, 999] and [s1]. Code `[888]`.'),search:evidence,logTurn:r=>logs.push(r)});
  const events=frames(await (await app.request('/chat',request('SECRET-user-content'))).text());
  const text=events.filter(e=>e.event==='text').map(e=>e.data.delta).join('');
  expect(text).toBe('Evidence [1][unverified source] and [1]. Code `[888]`.');
  expect(s.conversationTurns('alice','c')[1].content).toBe(text);
  expect(logs).toHaveLength(1);expect(JSON.stringify(logs)).not.toContain('SECRET');
  expect(logs[0]).toMatchObject({event:'turn',outcome:'complete',invalidCitations:1,tokens:{input:6,output:4,total:10}});
});
test('truncation is an error, keeps marked partial text, and never sends done', async () => {
  const s=store();const logs: unknown[]=[];
  const app=createApp({store:s,model:answerModel('Partial [1','length'),search:evidence,logTurn:r=>logs.push(r)});
  const output=await (await app.request('/chat',request())).text();
  expect(output).toContain('event: error');expect(output).not.toContain('event: done');
  expect(s.conversationTurns('alice','c')[1].content).toContain('[Generation interrupted.]');
  expect(s.conversationTurns('alice','c')[1].content).toContain('[unverified source]');
  expect(logs[0]).toMatchObject({outcome:'truncated'});
});
test('body and message limits reject oversized requests before saving turns', async () => {
  const s=store();const app=createApp({store:s,search:evidence,logTurn:()=>{}});
  expect((await app.request('/chat',request('x'.repeat(20001)))).status).toBe(400);
  expect((await app.request('/chat',request('x'.repeat(70000)))).status).toBe(413);
  expect(s.conversationTurns('alice','c')).toEqual([]);
});
test('forwarded headers and changing user ids cannot bypass the socket-IP limit', async () => {
  const s=store();const app=createApp({store:s,search:evidence,rateLimit:{limit:2,windowMs:60000},logTurn:()=>{}});
  for(let i=0;i<2;i++) expect((await app.request('/chat',{method:'POST',headers:{'X-Forwarded-For':String(i)},body:'bad'})).status).toBe(400);
  const response=await app.request('/chat',{...request('hello','different-user'),headers:{'Content-Type':'application/json','X-Forwarded-For':'new-ip'}});
  expect(response.status).toBe(429);expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
  expect(s.conversationTurns('different-user','c')).toEqual([]);
});
test('a network failure mid-stream returns a safe error and preserves interrupted text', async () => {
  const s=store();const logs:unknown[]=[];
  const m=new MockLanguageModelV3({doStream:async()=>({stream:new ReadableStream<LanguageModelV3StreamPart>({start(controller){
    controller.enqueue({type:'text-start',id:'a'});controller.enqueue({type:'text-delta',id:'a',delta:'Partial answer'});
    setTimeout(()=>controller.error(new TypeError('SECRET-network-provider-key')),10);
  }})})});
  const app=createApp({store:s,model:m,search:evidence,logTurn:r=>logs.push(r)});
  const output=await (await app.request('/chat',request())).text();
  expect(output).toContain('Partial answer');expect(output).toContain('event: error');expect(output).not.toContain('SECRET');expect(output).not.toContain('event: done');
  expect(s.conversationTurns('alice','c')[1].content).toBe('Partial answer\n[Generation interrupted.]');
  expect(logs).toHaveLength(1);expect(JSON.stringify(logs)).not.toContain('SECRET');expect(logs[0]).toMatchObject({outcome:'error'});
});


test('default logging emits one allowlisted line without SDK console error dumps', async () => {
  const stdout=vi.spyOn(console,'log').mockImplementation(()=>{});
  const stderr=vi.spyOn(console,'error').mockImplementation(()=>{});
  const s=store();
  const m=new MockLanguageModelV3({doStream:async()=>{throw new Error('SECRET-upstream-credential');}});
  const app=createApp({store:s,model:m,search:evidence});
  await (await app.request('/chat',request('SECRET-user-message'))).text();
  expect(stdout).toHaveBeenCalledTimes(1);
  const line=stdout.mock.calls[0][0];
  expect(typeof line).toBe('string');expect(line).not.toContain('SECRET');
  expect(JSON.parse(line)).toMatchObject({event:'turn',outcome:'error'});
  expect(stderr).not.toHaveBeenCalled();
});

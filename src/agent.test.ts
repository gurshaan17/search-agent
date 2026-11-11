import { expect, test } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { simulateReadableStream } from 'ai';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { runAgent, type SearchEvent } from './agent.js';
import { buildPrompt } from './prompt.js';

function modelWithCalls(count: number, repeat = false) {
  let round = 0;
  return new MockLanguageModelV3({ doStream: async (options) => {
    const searching = (round++ === 0 || repeat) && options.toolChoice?.type !== 'none';
    const chunks: LanguageModelV3StreamPart[] = searching
      ? Array.from({ length: count }, (_, i) => ({ type: 'tool-call', toolCallId: `${round}-${i}`, toolName: 'web_search', input: JSON.stringify({ query: `entity ${i}` }) }))
      : [{ type: 'text-start', id: 'answer' }, { type: 'text-delta', id: 'answer', delta: 'Evidence [1]' }, { type: 'text-end', id: 'answer' }];
    chunks.push({ type: 'finish', finishReason: { unified: searching ? 'tool-calls' : 'stop', raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } } });
    return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 0 }) };
  } });
}

test('SDK executes three searches concurrently in one step and streams synthesis', async () => {
  const events: SearchEvent[] = [];
  let active = 0;
  let peak = 0;
  const result = runAgent({ messages: [{ role: 'user', content: 'Compare three entities' }], model: modelWithCalls(3),
    onSearch: e => events.push(e), search: { search: async () => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, 20));
      active--;
      return { searchedAt: new Date().toISOString(), results: [] };
    } },
  });
  let text = '';
  for await (const delta of result.textStream) text += delta;
  expect(text).toBe('Evidence [1]');
  expect(peak).toBe(3);
  expect(events.filter(e => e.phase === 'start').map(e => e.step)).toEqual([1, 1, 1]);
  expect(events.slice(0, 3).every(e => e.phase === 'start')).toBe(true);
});

test('parallel batches cannot exceed the twelve-search turn budget', async () => {
  let calls = 0;
  const model = modelWithCalls(15, true);
  const result = runAgent({ messages: [{ role: 'user', content: 'Research' }], model,
    search: { search: async () => { calls++; return { searchedAt: new Date().toISOString(), results: [] }; } },
  });
  await result.consumeStream();
  expect(calls).toBe(12);
  expect(model.doStreamCalls).toHaveLength(2);
  expect(model.doStreamCalls.at(-1)?.toolChoice).toEqual({ type: 'none' });
});

test('NOW uses the supplied timezone and timeless knowledge needs no search', () => {
  const prompt = buildPrompt(new Date('2026-11-11T04:30:00Z'), 'Asia/Kolkata');
  expect(prompt).toContain('10:00');
  expect(prompt).toContain('Wednesday');
  expect(prompt).toContain('Do not search for timeless knowledge');
});

 test('four-step cap reserves the last call for synthesis', async () => {
  const model = modelWithCalls(1, true);
  const result = runAgent({ messages: [{ role: 'user', content: 'Research' }], model,
    search: { search: async () => ({ searchedAt: new Date().toISOString(), results: [] }) },
  });
  await result.consumeStream();
  expect(model.doStreamCalls).toHaveLength(4);
  expect(model.doStreamCalls.at(-1)?.toolChoice).toEqual({ type: 'none' });
});

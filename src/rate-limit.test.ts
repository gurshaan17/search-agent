import { expect, test } from 'vitest';
import { RateLimiter } from './rate-limit.js';
test('limits one IP, isolates another, and resets at the window boundary', () => {
  const limiter=new RateLimiter(2,1000);
  expect(limiter.take('a',0).allowed).toBe(true);expect(limiter.take('a',1).allowed).toBe(true);
  expect(limiter.take('a',2)).toEqual({allowed:false,retryAfter:1});expect(limiter.take('b',2).allowed).toBe(true);
  expect(limiter.take('a',1000).allowed).toBe(true);
});
test('expired identities are reclaimed at the bounded-map threshold', () => {
  const limiter=new RateLimiter(1,1000);
  for(let i=0;i<4096;i++) expect(limiter.take(String(i),0).allowed).toBe(true);
  expect(limiter.take('new',0).allowed).toBe(false);
  expect(limiter.take('new',1000).allowed).toBe(true);
});

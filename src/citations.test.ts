import { expect, test } from 'vitest';
import { CitationFilter, validateCitations } from './citations.js';
const known = (n: number) => [1,3].includes(n);
test('validates groups, normalizes source prefixes, and flags unknown numbers', () => {
  expect(validateCitations('A [1, 3] B [s3] C [999] D [0]',known)).toBe('A [1][3] B [3] C [unverified source] D [unverified source]');
});
test('a reference split at every possible boundary is never released before validation', () => {
  const text = 'Claim [1, 999, s3].';
  for (let split=0;split<=text.length;split++) {
    const filter=new CitationFilter(known);
    const output=filter.push(text.slice(0,split))+filter.push(text.slice(split))+filter.flush();
    expect(output).toBe('Claim [1][unverified source][3].');expect(filter.invalidCount).toBe(1);
  }
  const filter=new CitationFilter(known);
  expect(filter.push('Claim [99')).toBe('Claim ');
  expect(filter.push('9]')).toBe('[unverified source]');
});
test('preserves literal brackets and code across single-character chunks', () => {
  const text='[label](https://example.com) `array[999]`\n```js\nlet a = [999];\n```\nClaim [999].';
  const filter=new CitationFilter(known);
  let output='';for(const char of text) output+=filter.push(char);output+=filter.flush();
  expect(output).toBe(text.replace('Claim [999]','Claim [unverified source]'));
});
test('an interrupted numeric reference is flagged instead of left dangling', () => {
  const filter=new CitationFilter(known);expect(filter.push('Claim [42')+filter.flush()).toBe('Claim [unverified source]');
});

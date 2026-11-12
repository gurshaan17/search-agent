import { expect, test } from 'vitest';
import { ResearchCoverage } from './research.js';
const baseline = { id:2,questionId:1,question:'Compare Neon and Supabase',answer:'Neon $19; Supabase $25.',answeredAt:'2026-11-03T04:00:00Z',since:'2026-11-03' };
const input = { baselineId:2,entities:['Neon','Supabase'],entity:'Neon' };
test('research ties entity names and dates to a saved baseline', () => {
  const coverage = new ResearchCoverage([baseline]);
  expect(coverage.accept({ ...input, baselineId:99 })).toBeTruthy();
  expect(coverage.accept({ ...input, entities:['Invented'],entity:'Invented' })).toBeTruthy();
  expect(coverage.accept({ ...input, since:'2026-11-10' })).toBeTruthy();
  expect(coverage.accept(input)).toBeUndefined();
  expect(coverage.accept({ ...input,entities:['Neon'] })).toBeTruthy();
});
test('coverage tracks each current/dated attempt and distinguishes usable evidence from gaps', () => {
  const coverage = new ResearchCoverage([baseline]); coverage.accept(input);
  coverage.record('Neon',false,'usable'); coverage.record('Neon',true,'empty');
  expect(coverage.complete).toBe(false);
  coverage.record('Supabase',false,'failed'); coverage.record('Supabase',true,'empty');
  expect(coverage.complete).toBe(true);
  const summary = coverage.summary();
  expect('entities' in summary && summary.entities?.find(e => e.entity === 'Supabase')?.canCompareCurrentClaim).toBe(false);
  coverage.record('Neon',false,'failed');
  expect(JSON.stringify(coverage.summary())).toContain('usable');
});

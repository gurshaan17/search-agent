import { expect, test } from 'vitest';
import { assertions } from './assertions.js';
import { evalCases } from './cases.js';
import { INJECTION_CANARY } from './fixtures.js';
const get = (id: string) => evalCases.find(c => c.id === id)!;
const source = { id: 's1', domain: 'nodejs.org', url: 'https://nodejs.org', publishedDate: null };
test('single-search gate rejects extra calls and invented citation ids', () => {
  const calls = [{ query:'Node release',step:1 }];
  expect(Object.values(assertions(get('latest-node'),calls,'Node v26 [1]',[source],2)).every(Boolean)).toBe(true);
  expect(assertions(get('latest-node'),calls,'Node [999]',[source],2).validCitations).toBe(false);
  expect(assertions(get('latest-node'),[...calls,...calls],'Node [1]',[source],2).singleSearch).toBe(false);
});
test('injection echo and empty answers fail, even with valid searches', () => {
  const calls = [{ query:'Node release',step:1 }];
  expect(assertions(get('injection'),calls,`Node [1] ${INJECTION_CANARY}`,[source],2).ignoredInjection).toBe(false);
  expect(assertions(get('cap'),[],'',[],1).answer).toBe(false);
});
test('missing-history case rejects blind searches and multiple clarifying questions', () => {
  const c=get('crm-no-history');
  expect(Object.values(assertions(c,[],'I have no prior record. Which CRM tools?',[],1)).every(Boolean)).toBe(true);
  expect(assertions(c,[{query:'CRM',step:1}],'Which CRM tools?',[],2).noSearches).toBe(false);
  expect(assertions(c,[],'Which CRM tools? Which prices?',[],1).oneQuestion).toBe(false);
});
test('temporal checks require paired filters, date, baseline, and independent first-step calls', () => {
  const c=get('november-3');
  const calls=c.entities.flatMap(query=>[{query,since:'2026-11-03',step:1},{query,step:1}]);
  const text='3 November 2026 baseline $19 and $25.\nNeon Changed [1]\nSupabase Unchanged [1]\nAmazon RDS Unchanged [1]';
  expect(Object.values(assertions(c,calls,text,[source],2)).every(Boolean)).toBe(true);
  expect(assertions(c,calls.filter(call=>call.since),text,[source],2).pairedQueries).toBe(false);
  expect(assertions(c,calls.map(call=>({...call,step:2})),text,[source],3).parallelFirstStep).toBe(false);
  expect(assertions(c,calls,'Changed [1]',[source],2).baseline).toBe(false);
});

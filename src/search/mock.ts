import { createNormalizer, type RawResult, type SearchOptions, type SearchProvider } from './types.js';
export class MockSearchProvider implements SearchProvider {
  private normalize;
  constructor(private fixtures: Record<string, RawResult[] | Error>, now = () => new Date('2026-11-11T04:30:00Z')) { this.normalize = createNormalizer(now); }
  async search(query: string, options: SearchOptions = {}) {
    options.signal?.throwIfAborted();
    const match = Object.entries(this.fixtures).find(([key]) => query.toLowerCase().includes(key.toLowerCase()))?.[1] ?? [];
    if (match instanceof Error) throw match;
    return this.normalize(match, options);
  }
}

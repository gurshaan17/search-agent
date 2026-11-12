import Exa from 'exa-js';
import { setTimeout as delay } from 'node:timers/promises';
import { createNormalizer, type SearchProvider, type SearchOptions, type RawResult } from './types.js';

export type SearchTransport = (query: string, options: SearchOptions, signal: AbortSignal) => Promise<RawResult[]>;
export class ExaSearchProvider implements SearchProvider {
  private normalize = createNormalizer();
  constructor(private transport: SearchTransport, private timeoutMs = 8000) {}
  async search(query: string, options: SearchOptions = {}) {
    if (!query.trim()) throw new Error('Search query must not be empty.');
    const signal = AbortSignal.any([AbortSignal.timeout(this.timeoutMs), ...(options.signal ? [options.signal] : [])]);
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      try { return this.normalize(await this.transport(query, options, signal), options); }
      catch (error) {
        const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 0;
        if (signal.aborted || attempt === 1 || !(status === 429 || status >= 500 && status <= 599)) throw error;
        await delay(200, undefined, { signal });
      }
    }
  }
}
export function createExaProvider(apiKey: string, type: 'auto' | 'fast' = 'fast', maxCharacters = 1200) {
  if (!apiKey.trim()) throw new Error('EXA_API_KEY is required.');
  const client = new Exa(apiKey);
  return new ExaSearchProvider(async (query, options, signal) => {
    const response = await client.search(query, {
      type, numResults: Math.min(8, Math.max(1, Math.floor(options.numResults || 4))),
      startPublishedDate: options.since, endPublishedDate: options.until,
      contents: { highlights: { maxCharacters }, maxAgeHours: 0 },
    }, { signal });
    return response.results;
  });
}

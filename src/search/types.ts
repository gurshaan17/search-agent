export interface SearchOptions { since?: string; until?: string; numResults?: number; signal?: AbortSignal }
export interface SearchResult { id: string; title: string; url: string; domain: string; publishedDate: string | null; highlights: string[] }
export interface SearchResponse { searchedAt: string; results: SearchResult[]; note?: string }
export interface SearchProvider { search(query: string, options?: SearchOptions): Promise<SearchResponse> }
export interface RawResult { title?: string | null; url: string; publishedDate?: string | null; highlights?: string[] }

// Share one normalizer per turn so concurrent searches receive unique source IDs.
export function createNormalizer(now = () => new Date()) {
  const ids = new Map<string, string>();
  return (rows: RawResult[], options: SearchOptions = {}): SearchResponse => {
    const seen = new Set<string>();
    const results: SearchResult[] = [];
    const limit = Math.min(8, Math.max(1, Math.floor(options.numResults || 4)));
    for (const row of rows) {
      let url: URL;
      try { url = new URL(row.url); } catch { continue; }
      if (!['https:', 'http:'].includes(url.protocol)) continue;
      url.hash = '';
      const key = url.href;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!ids.has(key)) ids.set(key, `s${ids.size + 1}`);
      let remaining = 1200; // Bound context per source, even if the provider ignores its limit.
      const highlights = (row.highlights ?? []).map(text => {
        const clipped = text.slice(0, remaining); remaining -= clipped.length; return clipped;
      }).filter(Boolean);
      results.push({ id: ids.get(key)!, title: (row.title || url.hostname).slice(0, 300), url: key, domain: url.hostname, publishedDate: row.publishedDate ?? null, highlights });
      if (results.length === limit) break;
    }
    return { searchedAt: now().toISOString(), results, ...(options.since || options.until ? { note: 'Date filters match publication dates only; also check current official pages without date filters.' } : {}) };
  };
}

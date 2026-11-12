import type { Exchange, MemoryChunk, MemoryStore } from './db.js';
import { normalize, type Embedder } from './embeddings.js';

export interface SemanticHit { questionId: number; answerId: number; score: number; role: 'user' | 'assistant'; start: number; text: string }
export interface SemanticResult { hits: SemanticHit[]; status: 'ready' | 'partial' | 'unavailable' | 'disabled'; latencyMs: number }
export function chunksFor(exchange: Exchange) {
  const chunks: Omit<MemoryChunk, 'vector'>[] = [];
  for (const turn of [exchange.question, exchange.answer]) {
    // Overlap retains sentences at boundaries; short chunks also bound multilingual token counts.
    for (let start = 0; start < turn.content.length; start += 800) {
      chunks.push({ role: turn.role, start, text: turn.content.slice(start, start + 1000) });
      if (start + 1000 >= turn.content.length) break;
    }
  }
  return chunks;
}
export class SemanticMemory {
  private jobs = new Set<Promise<void>>();
  scheduleIndex(userId: string, before: string) {
    const job = this.index(userId,before,AbortSignal.timeout(4000)).then(() => {},() => {});
    this.jobs.add(job);
    void job.finally(() => this.jobs.delete(job));
  }
  async drain() { await Promise.allSettled(this.jobs); }
  constructor(private store: MemoryStore, private embedder: Embedder, private timeoutMs = 4000) {}
  async index(userId: string, before: string, signal?: AbortSignal): Promise<number> {
    const exchanges = this.store.pendingExchanges(userId,before,this.embedder.version);
    if (!exchanges.length) return 0;
    const chunks = exchanges.map(chunksFor);
    const texts = chunks.flatMap((parts,i) => parts.map(c => `Saved conversation. User question: ${exchanges[i].question.content.slice(0,200)}\n${c.role === 'assistant' ? 'Assistant reply' : 'User message'}: ${c.text}`));
    const vectors = await this.embedder.embed(texts,'document',signal);
    if (vectors.length !== texts.length) throw new Error('Incomplete embeddings');
    signal?.throwIfAborted();
    let cursor = 0;
    for (let i = 0; i < exchanges.length; i++) {
      this.store.saveMemory(exchanges[i],this.embedder.version,chunks[i].map(c => ({ ...c, vector: normalize(vectors[cursor++]) })));
    }
    return exchanges.length;
  }
  async retrieve(userId: string, query: string, before: string, signal?: AbortSignal, dates: { start: string; end: string }[] = []): Promise<SemanticResult> {
    const started = performance.now();
    if (!this.store.hasReplies(userId,before)) return { hits:[],status:'ready',latencyMs:0 };
    const deadline = AbortSignal.any([AbortSignal.timeout(this.timeoutMs), ...(signal ? [signal] : [])]);
    let status: SemanticResult['status'] = 'ready';
    let hits: SemanticHit[] = [];
    try {
      // Query encoding and a bounded legacy-history backfill run concurrently.
      const [queryVectors, indexed] = await Promise.allSettled([
        this.embedder.embed([query.slice(0,1000)],'query',deadline), this.index(userId,before,deadline),
      ]);
      signal?.throwIfAborted();
      if (queryVectors.status === 'rejected') throw new Error('Query embedding unavailable');
      if (indexed.status === 'rejected' || this.store.pendingExchanges(userId,before,this.embedder.version,1).length) status = 'partial';
      const vector = normalize(queryVectors.value[0]);
      const best = new Map<number, SemanticHit>();
      for (const row of this.store.memoryChunks(userId,before,this.embedder.version)) {
        if (dates.length && !dates.some(d => row.asked_at >= d.start && row.asked_at < d.end)) continue;
        if (row.vector.length !== vector.length) continue;
        const score = row.vector.reduce((sum,v,i) => sum + v * vector[i],0);
        if (score > (best.get(row.question_id)?.score ?? -1)) best.set(row.question_id, {
          questionId: row.question_id, answerId: row.answer_id, score, role: row.role, start: row.start, text: row.text,
        });
      }
      hits = [...best.values()].sort((a,b) => b.score - a.score).slice(0,24);
    } catch { status = 'unavailable'; }
    return { hits, status, latencyMs: Math.round(performance.now() - started) };
  }
}

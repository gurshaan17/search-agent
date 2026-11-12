import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { embedMany } from 'ai';

export interface Embedder {
  version: string;
  embed(texts: string[], kind: 'query' | 'document', signal?: AbortSignal): Promise<number[][]>;
}
export function normalize(vector: number[]): number[] {
  const length = Math.hypot(...vector);
  if (!vector.length || !Number.isFinite(length) || !length) throw new Error('Invalid embedding');
  return vector.map(v => v / length);
}
export function createEmbedder(): Embedder {
  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
  return {
    version: 'gemini-embedding-001:768:exchange-chunks-v1',
    async embed(texts, kind, signal) {
      const { embeddings } = await embedMany({ model: google.embedding('gemini-embedding-001'), values: texts,
        dimensions: 768, maxRetries: 0, maxParallelCalls: 2, abortSignal: signal,
        providerOptions: { google: { taskType: kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT' } } });
      if (embeddings.length !== texts.length || embeddings.some(v => v.length !== 768)) throw new Error('Invalid embedding response');
      return embeddings.map(normalize);
    },
  };
}

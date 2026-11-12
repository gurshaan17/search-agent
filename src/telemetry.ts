import type { LanguageModelUsage } from 'ai';
export function tokenMetrics(usage?: LanguageModelUsage) {
  return { input: usage?.inputTokens ?? null, output: usage?.outputTokens ?? null,
    total: usage?.totalTokens ?? null, cacheRead: usage?.inputTokenDetails.cacheReadTokens ?? null };
}
export interface TurnLog {
  event: 'turn'; userTurnId: number; turnId: number | null; outcome: 'complete' | 'error' | 'aborted' | 'truncated';
  searches: { resultCount: number; latencyMs: number; failed: boolean }[];
  timings: { ttfbMs: number; firstTokenMs: number | null; totalMs: number };
  retrieval?: { semantic: string; latencyMs: number; selected: number; ambiguous: boolean };
  tokens: ReturnType<typeof tokenMetrics>; invalidCitations: number;
}

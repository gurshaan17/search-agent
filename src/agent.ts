import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, stepCountIs, tool, type LanguageModel, type ModelMessage } from 'ai';
import { z } from 'zod';
import { buildPrompt } from './prompt.js';
import type { SearchProvider } from './search/types.js';

export const DEFAULT_MODEL = 'gemini-3.5-flash';
export interface SearchEvent {
  phase: 'start' | 'end'; step: number; query: string; since?: string; at: string;
}
export function runAgent(options: {
  messages: ModelMessage[]; search: SearchProvider; model?: LanguageModel;
  now?: Date; timezone?: string; signal?: AbortSignal;
  onSearch?: (event: SearchEvent) => void;
}) {
  let calls = 0;
  let step = 0;
  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
  return streamText({
    model: options.model ?? google(process.env.MODEL?.trim() || DEFAULT_MODEL),
    system: buildPrompt(options.now, options.timezone),
    messages: options.messages, abortSignal: options.signal,
    stopWhen: stepCountIs(4), maxOutputTokens: 2048, maxRetries: 0,
    prepareStep: ({ stepNumber }) => {
      step = stepNumber + 1;
      // Reserve the final step for synthesis rather than unanswered tool calls.
      return { toolChoice: stepNumber === 3 || calls >= 12 ? 'none' as const : 'auto' as const };
    },
    tools: {
      web_search: tool({
        description: 'Search current web facts. Independent calls in one step execute concurrently.',
        inputSchema: z.object({ query: z.string().trim().min(1), since: z.string().optional(), until: z.string().optional(), numResults: z.number().int().min(1).max(8).optional() }),
        execute: async ({ query, ...filters }, { abortSignal }) => {
          if (calls >= 12) return { error: 'Search budget exhausted. Use available evidence.' };
          calls++;
          const event = { step, query, since: filters.since };
          options.onSearch?.({ ...event, phase: 'start', at: new Date().toISOString() });
          try { return await options.search.search(query, { ...filters, signal: abortSignal }); }
          catch { return { error: 'Search failed. This query could not be verified.' }; }
          finally { options.onSearch?.({ ...event, phase: 'end', at: new Date().toISOString() }); }
        },
      }),
    },
  });
}

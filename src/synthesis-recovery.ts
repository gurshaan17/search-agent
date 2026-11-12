import type { LanguageModelMiddleware } from 'ai';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { setTimeout as delay } from 'node:timers/promises';

// Retry only synthesis, before any answer text has reached the caller. The same
// plain evidence and disabled tools are reused, so recovery cannot repeat research.
export const synthesisRecovery: LanguageModelMiddleware = {
  specificationVersion: 'v4',
  transformParams: async ({ params }) => params.toolChoice?.type === 'none' ? { ...params, abortSignal: AbortSignal.any([AbortSignal.timeout(30000), ...(params.abortSignal ? [params.abortSignal] : [])]) } : params,
  wrapStream: async ({ doStream, params }) => {
    if (params.toolChoice?.type !== 'none') return doStream();
    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      async start(controller) {
        for (let attempt = 0; attempt < 2; attempt++) {
          let visible = false;
          const pending: LanguageModelV4StreamPart[] = [];
          try {
            params.abortSignal?.throwIfAborted();
            const result = await doStream();
            let failed = false;
            for await (const part of result.stream) {
              params.abortSignal?.throwIfAborted();
              if (part.type === 'error' || part.type === 'finish' && part.finishReason.unified === 'error') failed = true;
              if (part.type === 'text-delta' && part.delta.trim()) visible = true;
              if (visible) {
                for (const buffered of pending.splice(0)) controller.enqueue(buffered);
                controller.enqueue(part);
              } else pending.push(part);
            }
            if (!failed && visible) { controller.close(); return; }
            if (visible) { controller.close(); return; }
            throw new Error('Empty or failed synthesis');
          } catch (error) {
            if (visible || attempt === 1 || params.abortSignal?.aborted) { controller.error(error); return; }
            try { await delay(150, undefined, { signal: params.abortSignal }); }
            catch (error) { controller.error(error); return; }
          }
        }
      },
    });
    return { stream };
  },
};

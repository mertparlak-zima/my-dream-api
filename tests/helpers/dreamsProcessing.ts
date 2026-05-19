import { processDream, scheduleDreamProcessing as scheduleProductionDreamProcessing } from '../../src/features/dreams/dreams.processor';
import type { DreamInterpretationProvider, DreamInterpretationRequest } from '../../src/features/dreams/dreams.provider';

type TestProviderOptions = {
  fail?: boolean;
  interpretation?: string;
  onRequest?: (request: DreamInterpretationRequest) => void;
};

export function createTestDreamProvider(options: TestProviderOptions = {}): DreamInterpretationProvider {
  return {
    async interpret(request) {
      options.onRequest?.(request);

      if (options.fail) {
        throw new Error('vitest: provider failure');
      }

      return {
        interpretation: options.interpretation ?? `vitest: interpretation for ${request.interpreter.name}`,
      };
    },
  };
}

export async function processDreamImmediately(dreamId: string): Promise<void> {
  await processDream(dreamId, {
    completionDelayMs: 0,
    provider: createTestDreamProvider(),
  });
}

export async function processDreamWithDelay(dreamId: string, completionDelayMs: number): Promise<void> {
  await processDream(dreamId, {
    completionDelayMs,
    provider: createTestDreamProvider(),
  });
}

export async function failDreamImmediately(dreamId: string): Promise<void> {
  await processDream(dreamId, {
    completionDelayMs: 0,
    provider: createTestDreamProvider({ fail: true }),
  });
}

export async function processDreamWithProvider(
  dreamId: string,
  provider: DreamInterpretationProvider,
  completionDelayMs = 0,
): Promise<void> {
  await processDream(dreamId, { completionDelayMs, provider });
}

export function scheduleDreamProcessing(dreamId: string): void {
  scheduleProductionDreamProcessing(dreamId);
}

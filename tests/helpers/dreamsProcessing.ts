import { processMockDream, scheduleMockDreamProcessing } from '../../src/features/dreams/dreams.processor';

export async function processDreamImmediately(dreamId: string): Promise<void> {
  await processMockDream(dreamId, { completionDelayMs: 0 });
}

export async function processDreamWithDelay(dreamId: string, completionDelayMs: number): Promise<void> {
  await processMockDream(dreamId, { completionDelayMs });
}

export function scheduleDreamProcessing(dreamId: string): void {
  scheduleMockDreamProcessing(dreamId);
}

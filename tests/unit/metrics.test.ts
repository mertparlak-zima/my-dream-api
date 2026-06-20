import { beforeEach, describe, expect, it } from 'vitest';

import {
  METRIC,
  getMetricsSnapshot,
  incrementMetric,
  resetMetrics,
} from '../../src/utils/metrics';

beforeEach(() => resetMetrics());

describe('metrics', () => {
  it('starts empty', () => {
    expect(getMetricsSnapshot()).toEqual({});
  });

  it('creates and accumulates counters (default and custom step)', () => {
    incrementMetric(METRIC.cacheHit); // new counter, default +1
    incrementMetric(METRIC.cacheHit); // existing counter
    incrementMetric(METRIC.cacheMiss, 3); // custom step
    expect(getMetricsSnapshot()).toEqual({ 'cache.hit': 2, 'cache.miss': 3 });
  });

  it('resets all counters', () => {
    incrementMetric(METRIC.rateLimitBlocked);
    resetMetrics();
    expect(getMetricsSnapshot()).toEqual({});
  });
});

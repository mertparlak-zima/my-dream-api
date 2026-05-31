import type { Context } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMock = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(() => 'event-id'),
  flush: vi.fn(async () => true),
  init: vi.fn(),
  setContext: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn((callback: (scope: {
    setContext: typeof sentryMock.setContext;
    setTag: typeof sentryMock.setTag;
    setUser: typeof sentryMock.setUser;
  }) => unknown) => callback({
    setContext: sentryMock.setContext,
    setTag: sentryMock.setTag,
    setUser: sentryMock.setUser,
  })),
}));

vi.mock('@sentry/bun', () => sentryMock);

function setSentryEnv(): void {
  process.env.SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
  process.env.SENTRY_ENVIRONMENT = 'development';
  process.env.SENTRY_RELEASE = 'test-release';
  process.env.SENTRY_TRACES_SAMPLE_RATE = '0.5';
}

function createContext(): Context {
  return {
    get(key: string) {
      return key === 'userId' ? 'user-id' : undefined;
    },
    req: {
      method: 'POST',
      path: '/debug-sentry',
      url: 'http://localhost:3000/auth/sync',
    },
  } as Context;
}

describe('sentry utilities', () => {
  beforeEach(() => {
    vi.resetModules();
    setSentryEnv();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_ENVIRONMENT;
    delete process.env.SENTRY_RELEASE;
    delete process.env.SENTRY_TRACES_SAMPLE_RATE;
    sentryMock.addBreadcrumb.mockClear();
    sentryMock.captureException.mockClear();
    sentryMock.flush.mockClear();
    sentryMock.init.mockClear();
    sentryMock.setContext.mockClear();
    sentryMock.setTag.mockClear();
    sentryMock.setUser.mockClear();
    sentryMock.withScope.mockClear();
  });

  it('initializes Sentry with release metadata and redacts sensitive event payloads', async () => {
    const { initSentry } = await import('../../src/utils/sentry');

    await initSentry();

    expect(sentryMock.init).toHaveBeenCalledWith(expect.objectContaining({
      dsn: 'https://public@example.ingest.sentry.io/1',
      environment: 'development',
      release: 'test-release',
      sendDefaultPii: false,
      tracesSampleRate: 0.5,
    }));

    const options = sentryMock.init.mock.calls[0]?.[0] as {
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown>;
    };
    const scrubbed = options.beforeSend({
      extra: {
        authorization: 'Bearer secret',
        content: 'vitest dream content',
        nested: { feedback_text: 'private feedback' },
        providerError: 'provider response included token abc123',
        safe: 'kept',
      },
      exception: {
        values: [
          {
            type: 'ExternalServiceError',
            value: 'provider response included OpenRouter API key',
          },
        ],
      },
    });

    expect(scrubbed).toEqual({
      extra: {
        authorization: '[Redacted]',
        content: '[Redacted]',
        nested: { feedback_text: '[Redacted]' },
        providerError: '[Redacted]',
        safe: 'kept',
      },
      exception: {
        values: [
          {
            type: 'ExternalServiceError',
            value: '[Redacted]',
          },
        ],
      },
    });
  });

  it('adds scrubbed breadcrumbs only after Sentry is initialized', async () => {
    const { addSentryBreadcrumb, initSentry } = await import('../../src/utils/sentry');

    addSentryBreadcrumb('dream.provider', 'ignored', { token: 'secret' });
    expect(sentryMock.addBreadcrumb).not.toHaveBeenCalled();

    await initSentry();
    addSentryBreadcrumb('dream.provider', 'provider failed', {
      dreamId: 'dream-id',
      messages: ['private prompt'],
      status: 400,
    }, 'error');

    expect(sentryMock.addBreadcrumb).toHaveBeenCalledWith({
      category: 'dream.provider',
      data: {
        dreamId: 'dream-id',
        messages: '[Redacted]',
        status: 400,
      },
      level: 'error',
      message: 'provider failed',
    });
  });

  it('captures unexpected errors with request and user context', async () => {
    const { captureUnexpectedError, initSentry } = await import('../../src/utils/sentry');

    await initSentry();
    const eventId = captureUnexpectedError(new Error('boom'), createContext());

    expect(eventId).toBe('event-id');
    expect(sentryMock.setTag).toHaveBeenCalledWith('http.method', 'POST');
    expect(sentryMock.setTag).toHaveBeenCalledWith('http.path', '/auth/sync');
    expect(sentryMock.setContext).toHaveBeenCalledWith('request', {
      method: 'POST',
      path: '/auth/sync',
    });
    expect(sentryMock.setUser).toHaveBeenCalledWith({ id: 'user-id' });
    expect(sentryMock.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  it('captures dream processing errors with safe structured context', async () => {
    const { captureDreamProcessingError, initSentry } = await import('../../src/utils/sentry');

    await initSentry();
    const eventId = captureDreamProcessingError(new Error('boom'), {
      dreamId: 'dream-id',
      failureClass: 'provider',
      modelId: 'openrouter-model',
      provider: 'openrouter',
      status: 502,
      userId: 'user-id',
    });

    expect(eventId).toBe('event-id');
    expect(sentryMock.setTag).toHaveBeenCalledWith('dream.id', 'dream-id');
    expect(sentryMock.setTag).toHaveBeenCalledWith('dream.failure_class', 'provider');
    expect(sentryMock.setTag).toHaveBeenCalledWith('dream.provider', 'openrouter');
    expect(sentryMock.setTag).toHaveBeenCalledWith('dream.model_id', 'openrouter-model');
    expect(sentryMock.setTag).toHaveBeenCalledWith('dream.status', '502');
    expect(sentryMock.setUser).toHaveBeenCalledWith({ id: 'user-id' });
    expect(sentryMock.setContext).toHaveBeenCalledWith('dream_processing', {
      dreamId: 'dream-id',
      failureClass: 'provider',
      modelId: 'openrouter-model',
      provider: 'openrouter',
      status: 502,
      userId: 'user-id',
    });
    expect(sentryMock.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  it('captures and flushes debug smoke events', async () => {
    const { captureDebugSentryEvent, initSentry } = await import('../../src/utils/sentry');

    await initSentry();
    const result = await captureDebugSentryEvent(createContext());

    expect(result).toEqual({ eventId: 'event-id', flushed: true });
    expect(sentryMock.captureException).toHaveBeenCalledWith(expect.any(Error));
    expect(sentryMock.flush).toHaveBeenCalledWith(2_000);
  });
});

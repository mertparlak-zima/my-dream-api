import type { Context } from 'hono';
import { SENTRY_CONFIG } from '../config';

const REDACTED = '[Redacted]';

const SENSITIVE_KEY_PATTERN = /authorization|cookie|set-cookie|token|secret|password|api[_-]?key|provider[_-]?key|openrouter|dsn/i;
const PRIVATE_PAYLOAD_KEY_PATTERN = /^(content|interpretation|feedback|feedback_text|userFeedbackText|systemPrompt|prompt|messages)$/i;
const SENSITIVE_TEXT_PATTERN = /authorization|bearer\s+[a-z0-9._-]+|provider response|openrouter api key|token/i;

let initialized = false;
let sentryClient: SentryClient | undefined;
const SENTRY_BUN_PACKAGE = '@sentry/bun';

type SentryEvent = Record<string, unknown>;

type SentryScope = {
  setTag(key: string, value: string): void;
  setContext(key: string, value: Record<string, unknown>): void;
  setUser(user: { id: string }): void;
};

type SentryClient = {
  addBreadcrumb?(breadcrumb: {
    category: string;
    data?: Record<string, unknown>;
    level?: 'debug' | 'error' | 'info' | 'warning';
    message: string;
  }): void;
  init(options: {
    dsn: string;
    environment: string;
    release?: string;
    tracesSampleRate: number;
    sendDefaultPii: boolean;
    beforeSend: (event: SentryEvent) => SentryEvent;
  }): void;
  captureException(error: Error): string;
  flush(timeout?: number): Promise<boolean>;
  withScope<T>(callback: (scope: SentryScope) => T): T;
};

export type DreamProcessingFailureClass = 'provider' | 'worker';

export type DreamProcessingErrorContext = {
  dreamId: string;
  failureClass: DreamProcessingFailureClass;
  modelId?: string;
  provider?: string;
  status?: number;
  userId?: string;
};

function shouldRedactKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key) || PRIVATE_PAYLOAD_KEY_PATTERN.test(key);
}

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return SENSITIVE_TEXT_PATTERN.test(value) ? REDACTED : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const scrubbed: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    scrubbed[key] = shouldRedactKey(key) ? REDACTED : scrubValue(nestedValue);
  }

  return scrubbed;
}

function scrubEvent(event: SentryEvent): SentryEvent {
  return scrubValue(event) as SentryEvent;
}

export async function initSentry(): Promise<void> {
  if (initialized || !SENTRY_CONFIG.DSN) {
    return;
  }

  sentryClient = await import(SENTRY_BUN_PACKAGE) as SentryClient;
  sentryClient.init({
    dsn: SENTRY_CONFIG.DSN,
    environment: SENTRY_CONFIG.ENVIRONMENT,
    release: SENTRY_CONFIG.RELEASE,
    tracesSampleRate: SENTRY_CONFIG.TRACES_SAMPLE_RATE,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });

  initialized = true;
}

export function isSentryEnabled(): boolean {
  return initialized;
}

export function addSentryBreadcrumb(
  category: string,
  message: string,
  data: Record<string, unknown> = {},
  level: 'debug' | 'error' | 'info' | 'warning' = 'info',
): void {
  if (!initialized || !sentryClient?.addBreadcrumb) {
    return;
  }

  sentryClient.addBreadcrumb({
    category,
    data: scrubValue(data) as Record<string, unknown>,
    level,
    message,
  });
}

export function captureUnexpectedError(error: Error, c: Context): string | undefined {
  if (!initialized || !sentryClient) {
    return undefined;
  }

  const client = sentryClient;
  const url = new URL(c.req.url);
  const path = url.pathname;
  const userId = c.get('userId');

  return client.withScope((scope) => {
    scope.setTag('http.method', c.req.method);
    scope.setTag('http.path', path);
    scope.setContext('request', {
      method: c.req.method,
      path,
    });

    if (typeof userId === 'string' && userId.length > 0) {
      scope.setUser({ id: userId });
    }

    return client.captureException(error);
  });
}

export function captureDreamProcessingError(
  error: Error,
  context: DreamProcessingErrorContext,
): string | undefined {
  if (!initialized || !sentryClient) {
    return undefined;
  }

  const client = sentryClient;

  return client.withScope((scope) => {
    scope.setTag('dream.id', context.dreamId);
    scope.setTag('dream.failure_class', context.failureClass);

    if (context.provider) {
      scope.setTag('dream.provider', context.provider);
    }

    if (context.modelId) {
      scope.setTag('dream.model_id', context.modelId);
    }

    if (typeof context.status === 'number') {
      scope.setTag('dream.status', String(context.status));
    }

    if (typeof context.userId === 'string' && context.userId.length > 0) {
      scope.setUser({ id: context.userId });
    }

    scope.setContext('dream_processing', scrubValue({
      dreamId: context.dreamId,
      failureClass: context.failureClass,
      modelId: context.modelId,
      provider: context.provider,
      status: context.status,
      userId: context.userId,
    }) as Record<string, unknown>);

    return client.captureException(error);
  });
}

export async function captureDebugSentryEvent(c: Context): Promise<{ eventId: string | undefined; flushed: boolean }> {
  if (!initialized || !sentryClient) {
    return { eventId: undefined, flushed: false };
  }

  const client = sentryClient;

  const eventId = client.withScope((scope) => {
    scope.setTag('http.method', c.req.method);
    scope.setTag('http.path', c.req.path);
    scope.setContext('request', {
      method: c.req.method,
      path: c.req.path,
    });

    return client.captureException(new Error('My Dream API Sentry first error'));
  });

  const flushed = await client.flush(2_000);

  return { eventId, flushed };
}

import type { Context } from 'hono';
import { SENTRY_CONFIG } from '../config';

const REDACTED = '[Redacted]';

const SENSITIVE_KEY_PATTERN = /authorization|cookie|set-cookie|token|secret|password|api[_-]?key|provider[_-]?key|openrouter|dsn/i;
const PRIVATE_PAYLOAD_KEY_PATTERN = /^(content|interpretation|feedback|feedback_text|userFeedbackText|systemPrompt|prompt|messages)$/i;

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

function shouldRedactKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key) || PRIVATE_PAYLOAD_KEY_PATTERN.test(key);
}

function scrubValue(value: unknown): unknown {
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

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Writable } from 'node:stream';
import winston from 'winston';
import { LOG_CONFIG } from '../config';
import { scrubValue } from './sentry';

/**
 * Centralized structured logger (#61). One Winston instance for the whole API.
 *
 * - Levels: error / warn / info / http / debug.
 * - Dev: pretty, colorized lines. Prod: JSON to stdout (Loki/Alloy → Grafana, #58).
 * - Every line carries the active request's `requestId` (+ `userId` once auth
 *   resolves) via AsyncLocalStorage, plus an `op` (operation) tag and free `meta`.
 * - Fields are scrubbed through the shared Sentry scrubber so secrets/PII never
 *   reach the logs. Silent in tests (LOG_ENABLED=false).
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'debug';
export type LogFormat = 'json' | 'pretty';
export type LogContext = { requestId: string; userId?: string };
export type LogFields = Record<string, unknown>;
export type SerializedError = { name: string; message: string; stack?: string };

const als = new AsyncLocalStorage<LogContext>();

/** Run `fn` with a per-request log context so all logs share its `requestId`. */
export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return als.run(context, fn);
}

/** The active request's log context, if any. */
export function getLogContext(): LogContext | undefined {
  return als.getStore();
}

/** Attach the resolved user id to the active request context (post-auth). */
export function setLogUser(userId: string): void {
  const store = als.getStore();
  if (store) {
    store.userId = userId;
  }
}

/** Normalize any thrown value into a structured, log-safe error shape. */
export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: 'NonError', message: String(error) };
}

const prettyPrinter = winston.format.printf((info) => {
  const { level, message, timestamp, ...rest } = info as { level: string; message: string; timestamp?: string } & LogFields;
  const meta = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
  return `${String(timestamp)} ${level}: ${String(message)}${meta}`;
});

/** Build the Winston format for a given output style. */
export function buildLogFormat(format: LogFormat): winston.Logform.Format {
  const timestamp = winston.format.timestamp();
  return format === 'json'
    ? winston.format.combine(timestamp, winston.format.json())
    : winston.format.combine(timestamp, winston.format.colorize(), prettyPrinter);
}

export type CreateLoggerOptions = {
  level: LogLevel;
  format: LogFormat;
  enabled: boolean;
  /** Optional sink for tests; defaults to the Console transport (stdout). */
  stream?: Writable;
};

/** Create a Winston logger from explicit options (also used by tests). */
export function createAppLogger(options: CreateLoggerOptions): winston.Logger {
  return winston.createLogger({
    level: options.level,
    silent: !options.enabled,
    format: buildLogFormat(options.format),
    transports: [
      options.stream
        ? new winston.transports.Stream({ stream: options.stream })
        : new winston.transports.Console(),
    ],
  });
}

const baseLogger = createAppLogger({
  level: LOG_CONFIG.LEVEL,
  format: LOG_CONFIG.FORMAT,
  enabled: LOG_CONFIG.ENABLED,
});

function emit(level: LogLevel, message: string, fields: LogFields = {}): void {
  const context = als.getStore();
  baseLogger.log(level, message, { ...context, ...(scrubValue(fields) as LogFields) });
}

export const logger = {
  error: (message: string, fields?: LogFields): void => emit('error', message, fields),
  warn: (message: string, fields?: LogFields): void => emit('warn', message, fields),
  info: (message: string, fields?: LogFields): void => emit('info', message, fields),
  http: (message: string, fields?: LogFields): void => emit('http', message, fields),
  debug: (message: string, fields?: LogFields): void => emit('debug', message, fields),
};

/**
 * Wrap a critical async operation so it always emits a consistent lifecycle:
 * `started` → `succeeded` (with durationMs) or `failed` (with error info).
 */
export async function withOp<T>(op: string, fn: () => Promise<T>, meta: LogFields = {}): Promise<T> {
  const start = Date.now();
  logger.info('started', { op, ...meta });
  try {
    const result = await fn();
    logger.info('succeeded', { op, durationMs: Date.now() - start, ...meta });
    return result;
  } catch (error) {
    logger.error('failed', { op, durationMs: Date.now() - start, err: serializeError(error), ...meta });
    throw error;
  }
}

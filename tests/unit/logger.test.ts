import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  buildLogFormat,
  createAppLogger,
  getLogContext,
  logger,
  runWithLogContext,
  serializeError,
  setLogUser,
  withOp,
} from '../../src/utils/logger';

function captureStream(): { stream: Writable; lines: string[] } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb): void {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { stream, lines };
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('logger', () => {
  describe('serializeError', () => {
    it('serializes Error instances with name/message/stack', () => {
      const result = serializeError(new TypeError('bad'));
      expect(result).toMatchObject({ name: 'TypeError', message: 'bad' });
      expect(typeof result.stack).toBe('string');
    });

    it('normalizes non-Error throwables', () => {
      expect(serializeError('plain')).toEqual({ name: 'NonError', message: 'plain' });
    });
  });

  describe('log context (AsyncLocalStorage)', () => {
    it('exposes the active context and attaches the user id', () => {
      expect(getLogContext()).toBeUndefined();

      runWithLogContext({ requestId: 'req-1' }, () => {
        expect(getLogContext()).toEqual({ requestId: 'req-1' });
        setLogUser('user-1');
        expect(getLogContext()).toEqual({ requestId: 'req-1', userId: 'user-1' });
      });

      // setLogUser outside a context is a safe no-op.
      setLogUser('orphan');
      expect(getLogContext()).toBeUndefined();
    });
  });

  describe('createAppLogger output', () => {
    it('writes structured JSON when enabled', async () => {
      const { stream, lines } = captureStream();
      const log = createAppLogger({ level: 'debug', format: 'json', enabled: true, stream });

      log.info('hello', { op: 'test', count: 2 });
      await flush();

      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
      expect(parsed).toMatchObject({ level: 'info', message: 'hello', op: 'test', count: 2 });
      expect(parsed.timestamp).toBeTypeOf('string');
    });

    it('writes pretty lines with and without meta', async () => {
      const { stream, lines } = captureStream();
      const log = createAppLogger({ level: 'debug', format: 'pretty', enabled: true, stream });

      log.info('plain');
      log.info('withmeta', { a: 1 });
      await flush();

      expect(lines.join('')).toContain('plain');
      expect(lines.join('')).toContain('withmeta');
      expect(lines.join('')).toContain('{"a":1}');
    });

    it('is silent when disabled', async () => {
      const { stream, lines } = captureStream();
      const log = createAppLogger({ level: 'debug', format: 'json', enabled: false, stream });

      log.error('should-not-write');
      await flush();

      expect(lines).toHaveLength(0);
    });

    it('builds both format variants', () => {
      expect(buildLogFormat('json')).toBeDefined();
      expect(buildLogFormat('pretty')).toBeDefined();
    });
  });

  describe('logger facade', () => {
    it('invokes every level (silent in tests) with and without fields/context', () => {
      expect(() => {
        runWithLogContext({ requestId: 'r' }, () => {
          logger.error('e', { op: 'x' });
          logger.warn('w');
          logger.info('i', { a: 1 });
          logger.http('h');
          logger.debug('d');
        });
      }).not.toThrow();
    });
  });

  describe('withOp', () => {
    it('returns the result on success', async () => {
      await expect(withOp('op.ok', async () => 42)).resolves.toBe(42);
    });

    it('logs and rethrows on failure', async () => {
      const boom = new Error('boom');
      await expect(withOp('op.fail', async () => { throw boom; }, { extra: 1 })).rejects.toBe(boom);
    });
  });
});

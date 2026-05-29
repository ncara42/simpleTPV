import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock del SDK: capturamos las llamadas a Sentry.init sin tocar la red.
const initMock = vi.fn();
vi.mock('@sentry/nestjs', () => ({
  init: (opts: unknown) => initMock(opts),
}));

import { initSentry } from './sentry.js';

describe('initSentry (API)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    initMock.mockClear();
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_ENVIRONMENT;
    delete process.env.SENTRY_RELEASE;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('no inicializa si no hay SENTRY_DSN', () => {
    process.env.NODE_ENV = 'production';
    expect(initSentry()).toBe(false);
    expect(initMock).not.toHaveBeenCalled();
  });

  it('no inicializa fuera de producción aunque haya DSN', () => {
    process.env.NODE_ENV = 'test';
    process.env.SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/1';
    expect(initSentry()).toBe(false);
    expect(initMock).not.toHaveBeenCalled();
  });

  it('inicializa en producción con DSN, sin tracing ni PII', () => {
    process.env.NODE_ENV = 'production';
    process.env.SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/1';
    process.env.SENTRY_ENVIRONMENT = 'production';
    expect(initSentry()).toBe(true);
    expect(initMock).toHaveBeenCalledTimes(1);
    const opts = initMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(opts.dsn).toBe('https://abc@o1.ingest.sentry.io/1');
    expect(opts.environment).toBe('production');
    expect(opts.tracesSampleRate).toBe(0);
    expect(opts.sendDefaultPii).toBe(false);
    expect(typeof opts.beforeSend).toBe('function');
  });

  it('beforeSend elimina cabeceras authorization y cookie', () => {
    process.env.NODE_ENV = 'production';
    process.env.SENTRY_DSN = 'https://abc@o1.ingest.sentry.io/1';
    initSentry();
    const opts = initMock.mock.calls[0]![0] as {
      beforeSend: (e: Record<string, unknown>) => Record<string, unknown>;
    };
    const scrubbed = opts.beforeSend({
      request: { headers: { authorization: 'Bearer x', cookie: 'a=b', 'x-org-id': 'keep' } },
    }) as { request: { headers: Record<string, string> } };
    expect(scrubbed.request.headers.authorization).toBeUndefined();
    expect(scrubbed.request.headers.cookie).toBeUndefined();
    expect(scrubbed.request.headers['x-org-id']).toBe('keep');
  });
});

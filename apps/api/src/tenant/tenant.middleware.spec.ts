import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { TenantMiddleware } from './tenant.middleware.js';

function mockReq(path: string, headers: Record<string, string> = {}): Request {
  return {
    path,
    header: (name: string) => headers[name],
  } as unknown as Request;
}

describe('TenantMiddleware', () => {
  const middleware = new TenantMiddleware();
  const res = {} as Response;

  it('exenta /health sin requerir X-Org-Id', () => {
    const next = vi.fn();
    middleware.use(mockReq('/health'), res, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rechaza request sin X-Org-Id', () => {
    expect(() =>
      middleware.use(mockReq('/products'), res, vi.fn() as NextFunction),
    ).toThrow(/X-Org-Id/);
  });

  it('rechaza X-Org-Id que no es UUID', () => {
    expect(() =>
      middleware.use(
        mockReq('/products', { 'X-Org-Id': 'not-a-uuid' }),
        res,
        vi.fn() as NextFunction,
      ),
    ).toThrow(/UUID/);
  });

  it('rechaza UUID con caracteres extraños (potencial SQL injection)', () => {
    expect(() =>
      middleware.use(
        mockReq('/products', { 'X-Org-Id': "'; DROP TABLE Organization; --" }),
        res,
        vi.fn() as NextFunction,
      ),
    ).toThrow(/UUID/);
  });

  it('pobla AsyncLocalStorage con UUID válido y llama next', () => {
    const validUuid = '11111111-1111-1111-1111-111111111111';
    let observed: string | undefined;

    middleware.use(
      mockReq('/products', { 'X-Org-Id': validUuid }),
      res,
      (() => {
        observed = tenantStorage.getStore()?.organizationId;
      }) as NextFunction,
    );

    expect(observed).toBe(validUuid);
  });
});

import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuditInterceptor } from './audit.interceptor.js';

function ctx(method: string, url: string, user?: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, originalUrl: url, url, user }) }),
  } as unknown as ExecutionContext;
}

function makePrisma() {
  return { auditLog: { create: vi.fn(async (_a?: unknown): Promise<unknown> => ({ id: 'a1' })) } };
}

const USER = { sub: 'u1', organizationId: 'org1', role: 'ADMIN' };

describe('AuditInterceptor', () => {
  it('registra una entrada en una mutación POST exitosa', async () => {
    const prisma = makePrisma();
    const interceptor = new AuditInterceptor(prisma as never);
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await lastValueFrom(interceptor.intercept(ctx('POST', '/products', USER), next));

    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
    const arg = prisma.auditLog.create.mock.calls[0]![0] as {
      data: { userId: string; action: string; entity: string };
    };
    expect(arg.data.userId).toBe('u1');
    expect(arg.data.action).toBe('POST');
    expect(arg.data.entity).toBe('products');
  });

  it('NO registra en un GET (lectura)', async () => {
    const prisma = makePrisma();
    const interceptor = new AuditInterceptor(prisma as never);
    const next: CallHandler = { handle: () => of([]) };

    await lastValueFrom(interceptor.intercept(ctx('GET', '/products', USER), next));

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('NO registra si la respuesta falla (no llega al tap de éxito)', async () => {
    const prisma = makePrisma();
    const interceptor = new AuditInterceptor(prisma as never);
    const next: CallHandler = {
      handle: () => ({ pipe: () => ({ subscribe: () => undefined }) }) as never,
    };
    // Si el handler nunca emite, no debe haber registro.
    interceptor.intercept(ctx('DELETE', '/products/1', USER), next);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

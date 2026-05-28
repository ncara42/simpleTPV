import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { getCurrentTenant } from '../prisma/tenant-context.js';
import { TenantContextInterceptor } from './tenant-context.interceptor.js';

function ctxWithUser(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('TenantContextInterceptor', () => {
  it('ejecuta el handler con el organizationId del JWT en el AsyncLocalStorage', async () => {
    const interceptor = new TenantContextInterceptor();
    const ctx = ctxWithUser({ sub: 'u1', organizationId: 'org-xyz', role: 'ADMIN' });

    let seen: string | undefined;
    const next: CallHandler = {
      handle: () => {
        seen = getCurrentTenant()?.organizationId;
        return of('ok');
      },
    };

    await lastValueFrom(interceptor.intercept(ctx, next));
    expect(seen).toBe('org-xyz');
  });

  it('si no hay user (ruta pública) ejecuta el handler sin contexto de tenant', async () => {
    const interceptor = new TenantContextInterceptor();
    const ctx = ctxWithUser(undefined);

    let seen: string | undefined = 'NOT-SET';
    const next: CallHandler = {
      handle: () => {
        seen = getCurrentTenant()?.organizationId;
        return of('ok');
      },
    };

    await lastValueFrom(interceptor.intercept(ctx, next));
    expect(seen).toBeUndefined();
  });
});

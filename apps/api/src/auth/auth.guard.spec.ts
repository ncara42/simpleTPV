import type { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';

import { AuthGuard } from './auth.guard.js';

const SECRET = 'test-access-secret';

function ctxWithAuth(header?: string): { ctx: ExecutionContext; req: Record<string, unknown> } {
  const req: Record<string, unknown> = { headers: header ? { authorization: header } : {} };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

function makeGuard(): AuthGuard {
  const jwt = new JwtService({});
  return new AuthGuard(jwt, { accessSecret: SECRET });
}

describe('AuthGuard', () => {
  it('rechaza (401) cuando no hay header Authorization', async () => {
    const guard = makeGuard();
    const { ctx } = ctxWithAuth(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow();
  });

  it('rechaza (401) cuando el token es inválido', async () => {
    const guard = makeGuard();
    const { ctx } = ctxWithAuth('Bearer garbage.token');
    await expect(guard.canActivate(ctx)).rejects.toThrow();
  });

  it('acepta token válido y popula request.user con los claims', async () => {
    const jwt = new JwtService({});
    const token = await jwt.signAsync(
      { sub: 'user-1', organizationId: 'org-1', role: 'ADMIN' },
      { secret: SECRET },
    );
    const guard = makeGuard();
    const { ctx, req } = ctxWithAuth(`Bearer ${token}`);
    const allowed = await guard.canActivate(ctx);
    expect(allowed).toBe(true);
    expect((req.user as Record<string, unknown>).sub).toBe('user-1');
    expect((req.user as Record<string, unknown>).organizationId).toBe('org-1');
    expect((req.user as Record<string, unknown>).role).toBe('ADMIN');
  });
});

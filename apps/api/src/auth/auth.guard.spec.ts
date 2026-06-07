import type { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';

import { AuthGuard } from './auth.guard.js';
import type { UserState, UserStateValidator } from './user-state.service.js';

const SECRET = 'test-access-secret';

function ctxWithAuth(header?: string): { ctx: ExecutionContext; req: Record<string, unknown> } {
  const req: Record<string, unknown> = { headers: header ? { authorization: header } : {} };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

function makeGuard(validator?: UserStateValidator): AuthGuard {
  const jwt = new JwtService({});
  return new AuthGuard(jwt, { accessSecret: SECRET }, undefined, validator);
}

function tokenWith(claims: {
  sub?: string;
  organizationId?: string;
  role?: string;
}): Promise<string> {
  return new JwtService({}).signAsync(
    { sub: 'user-1', organizationId: 'org-1', role: 'ADMIN', ...claims },
    { secret: SECRET },
  );
}

// Validador de estado de usuario con una respuesta fija (o que lanza), para los
// tests de revalidación por petición (A-04).
function validatorReturning(state: UserState | null): UserStateValidator {
  return { getState: () => Promise.resolve(state) };
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
    const token = await tokenWith({});
    const guard = makeGuard();
    const { ctx, req } = ctxWithAuth(`Bearer ${token}`);
    const allowed = await guard.canActivate(ctx);
    expect(allowed).toBe(true);
    expect((req.user as Record<string, unknown>).sub).toBe('user-1');
    expect((req.user as Record<string, unknown>).organizationId).toBe('org-1');
    expect((req.user as Record<string, unknown>).role).toBe('ADMIN');
  });

  // --- Revalidación por petición (A-04) ---

  it('revalida y acepta si el usuario sigue activo con el mismo rol', async () => {
    const token = await tokenWith({ role: 'ADMIN' });
    const guard = makeGuard(validatorReturning({ active: true, role: 'ADMIN' }));
    const { ctx, req } = ctxWithAuth(`Bearer ${token}`);
    expect(await guard.canActivate(ctx)).toBe(true);
    expect((req.user as Record<string, unknown>).sub).toBe('user-1');
  });

  it('rechaza (401) si el usuario fue desactivado tras emitir el token', async () => {
    const token = await tokenWith({ role: 'ADMIN' });
    const guard = makeGuard(validatorReturning({ active: false, role: 'ADMIN' }));
    const { ctx } = ctxWithAuth(`Bearer ${token}`);
    await expect(guard.canActivate(ctx)).rejects.toThrow();
  });

  it('rechaza (401) si el usuario ya no existe (borrado)', async () => {
    const token = await tokenWith({ role: 'ADMIN' });
    const guard = makeGuard(validatorReturning(null));
    const { ctx } = ctxWithAuth(`Bearer ${token}`);
    await expect(guard.canActivate(ctx)).rejects.toThrow();
  });

  it('rechaza (401) si el rol del token ya no coincide con el actual', async () => {
    const token = await tokenWith({ role: 'ADMIN' });
    const guard = makeGuard(validatorReturning({ active: true, role: 'CLERK' }));
    const { ctx } = ctxWithAuth(`Bearer ${token}`);
    await expect(guard.canActivate(ctx)).rejects.toThrow();
  });

  it('fail-open: si la revalidación falla (BD caída) acepta el token válido', async () => {
    const token = await tokenWith({ role: 'ADMIN' });
    const guard = makeGuard({
      getState: () => Promise.reject(new Error('db down')),
    });
    const { ctx, req } = ctxWithAuth(`Bearer ${token}`);
    expect(await guard.canActivate(ctx)).toBe(true);
    expect((req.user as Record<string, unknown>).sub).toBe('user-1');
  });
});

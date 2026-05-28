import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { RolesGuard } from './roles.guard.js';

function ctxWithRole(role: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeGuard(required: string[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: () => required,
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('permite si no hay roles requeridos (endpoint sin @Roles)', () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(ctxWithRole('CLERK'))).toBe(true);
  });

  it('permite si el rol del usuario está entre los requeridos', () => {
    const guard = makeGuard(['ADMIN', 'MANAGER']);
    expect(guard.canActivate(ctxWithRole('MANAGER'))).toBe(true);
  });

  it('deniega (403) si el rol no está entre los requeridos', () => {
    const guard = makeGuard(['ADMIN']);
    expect(() => guard.canActivate(ctxWithRole('CLERK'))).toThrow();
  });
});

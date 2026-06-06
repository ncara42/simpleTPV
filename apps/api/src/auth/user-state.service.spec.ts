import { describe, expect, it, vi } from 'vitest';

import type { AuthLookupService } from './auth-lookup.service.js';
import { UserStateService } from './user-state.service.js';

type StateImpl = () => Promise<{ active: boolean; role: string } | null>;

function makeLookup(impl: StateImpl): AuthLookupService {
  return { getUserState: vi.fn(impl) } as unknown as AuthLookupService;
}

describe('UserStateService', () => {
  it('devuelve el estado del usuario y cachea el resultado (un solo lookup)', async () => {
    const lookup = makeLookup(() => Promise.resolve({ active: true, role: 'ADMIN' }));
    const svc = new UserStateService(lookup);

    expect(await svc.getState('u1')).toEqual({ active: true, role: 'ADMIN' });
    expect(await svc.getState('u1')).toEqual({ active: true, role: 'ADMIN' });
    expect(lookup.getUserState).toHaveBeenCalledTimes(1);
  });

  it('cachea también el negativo (usuario no encontrado)', async () => {
    const lookup = makeLookup(() => Promise.resolve(null));
    const svc = new UserStateService(lookup);

    expect(await svc.getState('ghost')).toBeNull();
    expect(await svc.getState('ghost')).toBeNull();
    expect(lookup.getUserState).toHaveBeenCalledTimes(1);
  });

  it('con TTL 0 revalida en cada llamada (sin cache efectivo)', async () => {
    const prev = process.env.AUTH_REVALIDATE_TTL_MS;
    process.env.AUTH_REVALIDATE_TTL_MS = '0';
    try {
      const lookup = makeLookup(() => Promise.resolve({ active: true, role: 'ADMIN' }));
      const svc = new UserStateService(lookup);
      await svc.getState('u1');
      await svc.getState('u1');
      expect(lookup.getUserState).toHaveBeenCalledTimes(2);
    } finally {
      process.env.AUTH_REVALIDATE_TTL_MS = prev;
    }
  });

  it('propaga el error del lookup (el guard lo traduce a fail-open)', async () => {
    const lookup = makeLookup(() => Promise.reject(new Error('db down')));
    const svc = new UserStateService(lookup);
    await expect(svc.getState('u1')).rejects.toThrow('db down');
  });
});

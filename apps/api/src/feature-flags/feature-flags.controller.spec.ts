import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { FeatureFlagsController } from './feature-flags.controller.js';

// Controller fino: delega en FeatureFlagService mapeando req.user (sub/role) al actor
// que el servicio usa para assertStoreAccess (SEC-01). Valida la key en el DELETE.

function makeService() {
  return {
    list: vi.fn(async () => ({ catalog: [], flags: [] })),
    setFlag: vi.fn(async () => ({ id: 'ff-1' })),
    clearFlag: vi.fn(async () => undefined),
  };
}

const req = { user: { sub: 'user-1', role: 'MANAGER', organizationId: 'org-1' } };

describe('FeatureFlagsController', () => {
  it('list delega en features.list()', async () => {
    const svc = makeService();
    const ctrl = new FeatureFlagsController(svc as never);

    await ctrl.list();

    expect(svc.list).toHaveBeenCalledOnce();
  });

  it('setFlag delega con key/enabled/storeId y el actor de req.user', async () => {
    const svc = makeService();
    const ctrl = new FeatureFlagsController(svc as never);

    await ctrl.setFlag({ key: 'b2b', enabled: false, storeId: 'store-1' } as never, req as never);

    expect(svc.setFlag).toHaveBeenCalledWith('b2b', false, 'store-1', {
      userId: 'user-1',
      role: 'MANAGER',
    });
  });

  it('clearFlag delega con la key, el storeId opcional y el actor', async () => {
    const svc = makeService();
    const ctrl = new FeatureFlagsController(svc as never);

    await ctrl.clearFlag('time_clock', req as never, 'store-1');

    expect(svc.clearFlag).toHaveBeenCalledWith('time_clock', 'store-1', {
      userId: 'user-1',
      role: 'MANAGER',
    });
  });

  it('clearFlag rechaza una key que no es del catálogo (400)', () => {
    const svc = makeService();
    const ctrl = new FeatureFlagsController(svc as never);

    expect(() => ctrl.clearFlag('inexistente', req as never, undefined)).toThrow(
      BadRequestException,
    );
    expect(svc.clearFlag).not.toHaveBeenCalled();
  });
});

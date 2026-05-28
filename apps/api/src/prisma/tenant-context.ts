import { AsyncLocalStorage } from 'node:async_hooks';

import { InternalServerErrorException } from '@nestjs/common';

export interface TenantContext {
  organizationId: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getCurrentTenant(): TenantContext | undefined {
  return tenantStorage.getStore();
}

// Para escrituras que necesitan el organizationId explícito (INSERT con RLS):
// devuelve el tenant del contexto o falla si no hay (no debería ocurrir tras los
// guards, de ahí 500).
export function requireTenant(): TenantContext {
  const tenant = tenantStorage.getStore();
  if (!tenant) {
    throw new InternalServerErrorException('Sin contexto de tenant');
  }
  return tenant;
}

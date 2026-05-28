import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  organizationId: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getCurrentTenant(): TenantContext | undefined {
  return tenantStorage.getStore();
}

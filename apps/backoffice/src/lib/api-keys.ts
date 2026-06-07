import type { ApiKey, ApiKeyCreated, CreateApiKeyInput } from '@simpletpv/auth';

import { isDemo } from './api-config.js';
import { api } from './auth.js';

export type { ApiKey, ApiKeyCreated, CreateApiKeyInput };

const DEMO_KEYS: ApiKey[] = [
  {
    id: 'ak-1',
    name: 'ERP corporativo',
    prefix: 'abc12345',
    priceListId: null,
    createdAt: new Date(Date.now() - 10 * 86400_000).toISOString(),
    lastUsedAt: new Date(Date.now() - 3_600_000).toISOString(),
    revokedAt: null,
  },
  {
    id: 'ak-2',
    name: 'API mayorista',
    prefix: 'xyz98765',
    priceListId: 'pl-1',
    createdAt: new Date(Date.now() - 3 * 86400_000).toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  },
];

export function listApiKeys(): Promise<ApiKey[]> {
  if (isDemo()) return Promise.resolve(DEMO_KEYS.map((k) => ({ ...k })));
  return api.get<ApiKey[]>('/api-keys');
}

export function createApiKey(input: CreateApiKeyInput): Promise<ApiKeyCreated> {
  if (isDemo()) {
    const prefix = 'demo1234';
    const created: ApiKey = {
      id: `ak-${Date.now()}`,
      name: input.name,
      prefix,
      priceListId: input.priceListId ?? null,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    // Persiste en el array demo (mutable) para que la tabla refleje el alta.
    DEMO_KEYS.unshift(created);
    return Promise.resolve({
      ...created,
      key: `stpv_${prefix}_demoKeyOnlyShownOnce_${Date.now()}`,
    });
  }
  return api.post<ApiKeyCreated>('/api-keys', input);
}

export function revokeApiKey(id: string): Promise<void> {
  if (isDemo()) {
    const k = DEMO_KEYS.find((x) => x.id === id);
    if (k) k.revokedAt = new Date().toISOString();
    return Promise.resolve();
  }
  return api.del(`/api-keys/${id}`);
}

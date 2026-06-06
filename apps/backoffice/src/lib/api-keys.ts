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
  if (isDemo()) return Promise.resolve(DEMO_KEYS);
  return api.get<ApiKey[]>('/api-keys');
}

export function createApiKey(input: CreateApiKeyInput): Promise<ApiKeyCreated> {
  if (isDemo()) {
    return Promise.resolve({
      id: `ak-${Date.now()}`,
      name: input.name,
      prefix: 'demo1234',
      priceListId: input.priceListId ?? null,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
      key: `stpv_demo1234_demoKeyOnlyShownOnce_${Date.now()}`,
    });
  }
  return api.post<ApiKeyCreated>('/api-keys', input);
}

export function revokeApiKey(id: string): Promise<void> {
  if (isDemo()) return Promise.resolve();
  return api.del(`/api-keys/${id}`);
}

import type { ApiKey, ApiKeyCreated, CreateApiKeyInput } from '@simpletpv/auth';

import { api } from './auth.js';

export type { ApiKey, ApiKeyCreated, CreateApiKeyInput };

export function listApiKeys(): Promise<ApiKey[]> {
  return api.get<ApiKey[]>('/api-keys');
}

export function createApiKey(input: CreateApiKeyInput): Promise<ApiKeyCreated> {
  return api.post<ApiKeyCreated>('/api-keys', input);
}

export function revokeApiKey(id: string): Promise<void> {
  return api.del(`/api-keys/${id}`);
}

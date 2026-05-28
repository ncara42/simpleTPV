import { type ApiClient, createApiClient } from './api-client.js';
import { type AuthStore, createAuthStore } from './auth-store.js';

export interface AuthSetup {
  useAuthStore: AuthStore;
  api: ApiClient;
}

// Crea el store + cliente para una app concreta. `appKey` aísla la sesión en
// localStorage (TPV y backoffice no comparten sesión en el mismo navegador).
export function setupAuth(appKey: string): AuthSetup {
  const useAuthStore = createAuthStore(`simpletpv.auth.${appKey}`);
  const api = createApiClient(useAuthStore);
  return { useAuthStore, api };
}

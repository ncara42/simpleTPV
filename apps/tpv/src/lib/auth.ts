import type { AppEvent } from '@simpletpv/auth';
import { setupAuth } from '@simpletpv/auth';

import { DEMO_JWT } from '../demo/demoData.js';

const setup = setupAuth('tpv');

export const useAuthStore = setup.useAuthStore;

// Modo demo: el login acepta cualquier credencial y guarda un JWT falso (sin
// firma válida) para que getRole() lea role=CLERK. No llama a la API. El SSE no
// existe en demo: subscribeEvents devuelve un unsubscribe no-op.
export const api = {
  ...setup.api,
  login: (_email: string, _password: string): Promise<void> => {
    setup.useAuthStore.getState().setTokens({ accessToken: DEMO_JWT, refreshToken: DEMO_JWT });
    return Promise.resolve();
  },
  subscribeEvents: (_onEvent: (event: AppEvent) => void): (() => void) => {
    return () => {};
  },
};

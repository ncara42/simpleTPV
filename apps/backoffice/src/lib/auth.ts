import type { AppEvent } from '@simpletpv/auth';
import { setupAuth } from '@simpletpv/auth';

import { DEMO_JWT } from '../demo/demoData.js';

const setup = setupAuth('backoffice');

export const useAuthStore = setup.useAuthStore;

// Modo demo: login acepta cualquier credencial y guarda un JWT falso con
// role=ADMIN (para pasar el guard del backoffice). No llama a la API.
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

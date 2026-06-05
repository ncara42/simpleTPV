import type { AppEvent } from '@simpletpv/auth';
import { setupAuth } from '@simpletpv/auth';

import { DEMO_JWT } from '../demo/demoData.js';
import { isDemo } from './api-config.js';

const setup = setupAuth('backoffice');

export const useAuthStore = setup.useAuthStore;

// En modo real (DEFAULT), `api` es el cliente HTTP de @simpletpv/auth: login real
// contra POST /auth/login (el JWT lleva organizationId+role → RLS + guard). En modo
// DEMO (opt-in, VITE_DEMO_MODE=true) se sobrescribe login con un JWT falso role=ADMIN
// (para pasar el guard) y subscribeEvents no-op, para dev/e2e sin backend.
//
// A-02: el demo YA NO es incondicional — por defecto el backoffice exige login real,
// así no queda un panel de administración con bypass total de login al exponerse.
export const api = isDemo()
  ? {
      ...setup.api,
      login: (_email: string, _password: string): Promise<void> => {
        setup.useAuthStore.getState().setTokens({ accessToken: DEMO_JWT });
        return Promise.resolve();
      },
      subscribeEvents: (_onEvent: (event: AppEvent) => void): (() => void) => {
        return () => {};
      },
    }
  : setup.api;

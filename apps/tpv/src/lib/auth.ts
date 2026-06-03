import type { AppEvent } from '@simpletpv/auth';
import { setupAuth } from '@simpletpv/auth';

import { DEMO_JWT } from '../demo/demoData.js';
import { isDemo } from './api-config.js';

const setup = setupAuth('tpv');

export const useAuthStore = setup.useAuthStore;

// En modo real, `api` es el cliente HTTP de @simpletpv/auth: login real contra
// POST /auth/login (el JWT lleva el organizationId → multi-tenancy vía RLS) y SSE
// real en /events. En modo demo se sobrescribe login (JWT falso, role=CLERK, sin
// llamar a la API) y subscribeEvents (no-op), para dev/e2e sin backend.
export const api = isDemo()
  ? {
      ...setup.api,
      login: (_email: string, _password: string): Promise<void> => {
        setup.useAuthStore.getState().setTokens({ accessToken: DEMO_JWT, refreshToken: DEMO_JWT });
        return Promise.resolve();
      },
      subscribeEvents: (_onEvent: (event: AppEvent) => void): (() => void) => {
        return () => {};
      },
    }
  : setup.api;

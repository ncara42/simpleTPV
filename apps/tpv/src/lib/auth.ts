import { setupAuth } from '@simpletpv/auth';

const setup = setupAuth('tpv', import.meta.env.VITE_API_URL);

export const useAuthStore = setup.useAuthStore;

export const api = setup.api;

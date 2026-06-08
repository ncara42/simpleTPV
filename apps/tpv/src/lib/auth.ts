import { setupAuth } from '@simpletpv/auth';

const setup = setupAuth('tpv');

export const useAuthStore = setup.useAuthStore;

export const api = setup.api;

import { setupAuth } from '@simpletpv/auth';

const setup = setupAuth('backoffice');

export const useAuthStore = setup.useAuthStore;

export const api = setup.api;

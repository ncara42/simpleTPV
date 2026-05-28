import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (tokens: AuthTokens) => void;
  setAccessToken: (accessToken: string) => void;
  clear: () => void;
  isAuthenticated: () => boolean;
}

// Store de sesión persistido en localStorage. La clave incluye el nombre de la
// app para que TPV y backoffice no compartan sesión en el mismo navegador.
export function createAuthStore(storageKey: string) {
  return create<AuthState>()(
    persist(
      (set, get) => ({
        accessToken: null,
        refreshToken: null,
        setTokens: ({ accessToken, refreshToken }) => set({ accessToken, refreshToken }),
        setAccessToken: (accessToken) => set({ accessToken }),
        clear: () => set({ accessToken: null, refreshToken: null }),
        isAuthenticated: () => get().accessToken !== null,
      }),
      { name: storageKey },
    ),
  );
}

export type AuthStore = ReturnType<typeof createAuthStore>;

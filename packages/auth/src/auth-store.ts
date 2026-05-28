import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { UserRole } from './api-types.js';

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
  getRole: () => UserRole | null;
}

// Lee el claim `role` del payload del JWT sin verificar la firma (la verificación
// es responsabilidad del backend; aquí solo decidimos qué pintar). Devuelve null
// si el token falta o no es decodificable.
function decodeRole(token: string | null): UserRole | null {
  if (!token) {
    return null;
  }
  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      role?: UserRole;
    };
    return json.role ?? null;
  } catch {
    return null;
  }
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
        getRole: () => decodeRole(get().accessToken),
      }),
      { name: storageKey },
    ),
  );
}

export type AuthStore = ReturnType<typeof createAuthStore>;

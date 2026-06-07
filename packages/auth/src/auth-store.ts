import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { UserRole } from './api-types.js';

// El refresh token ya NO vive en el cliente (SEC-20): la API lo gestiona en una
// cookie httpOnly. El store solo guarda el accessToken (corta vida).
export interface AuthTokens {
  accessToken: string;
}

export interface AuthState {
  accessToken: string | null;
  setTokens: (tokens: AuthTokens) => void;
  setAccessToken: (accessToken: string) => void;
  clear: () => void;
  isAuthenticated: () => boolean;
  getRole: () => UserRole | null;
}

// SOLO PARA UI. Lee el claim `role` del payload del JWT SIN verificar la firma:
// un cliente podría falsificarlo, así que getRole() jamás debe usarse como
// frontera de seguridad. La autoridad real es el backend, que verifica la firma
// del token (AuthGuard) y el rol (@Roles) en CADA petición — un rol falseado aquí
// solo cambia qué se pinta; toda acción/lectura protegida sigue devolviendo 403.
// No uses getRole() para decidir algo que sustituya una llamada a la API.
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
//
// S-08 (accept-risk): solo se persiste el accessToken (JWT de vida corta); el
// refresh token vive en cookie httpOnly fuera de JS (SEC-20). Un access en
// localStorage es accesible a XSS, pero se acepta el riesgo porque (1) es de
// vida corta y (2) la CSP estricta de los SPAs (`script-src 'self'`) bloquea la
// inyección de scripts externos. Para cerrarlo del todo: mover a sessionStorage
// vía `storage: createJSONStorage(() => sessionStorage)`.
export function createAuthStore(storageKey: string) {
  return create<AuthState>()(
    persist(
      (set, get) => ({
        accessToken: null,
        setTokens: ({ accessToken }) => set({ accessToken }),
        setAccessToken: (accessToken) => set({ accessToken }),
        clear: () => set({ accessToken: null }),
        isAuthenticated: () => get().accessToken !== null,
        getRole: () => decodeRole(get().accessToken),
      }),
      { name: storageKey },
    ),
  );
}

export type AuthStore = ReturnType<typeof createAuthStore>;

import { useEffect, useRef } from 'react';

import { api } from './auth.js';

// Auto-login SOLO en desarrollo (para pruebas, sin teclear credenciales). Si
// VITE_DEV_AUTOLOGIN_EMAIL/PASSWORD están definidos y no hay sesión, entra
// automáticamente. `import.meta.env.DEV` es false en los builds de producción
// (y en los e2e, que corren sobre `vite preview`), así que todo este código se
// elimina del bundle: jamás hay bypass de login en producción.
export function useDevAutoLogin(noSession: boolean): void {
  const tried = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV || !noSession || tried.current) return;
    const email = import.meta.env.VITE_DEV_AUTOLOGIN_EMAIL;
    const password = import.meta.env.VITE_DEV_AUTOLOGIN_PASSWORD;
    if (!email || !password) return;
    tried.current = true;
    void api.login(email, password).catch(() => {
      tried.current = false; // si falló (p. ej. API caída), permite reintentar
    });
  }, [noSession]);
}

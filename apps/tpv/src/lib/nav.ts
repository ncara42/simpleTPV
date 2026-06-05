import { siblingAppUrl } from '@simpletpv/ui';

// Toggle Backoffice/TPV. La derivación de URL vive en @simpletpv/ui (siblingAppUrl);
// aquí solo el destino propio: TPV → backoffice (subdominio admin, dev :5174).
export function switchApp(app: 'backoffice' | 'tpv'): void {
  if (app === 'tpv') return; // ya estamos en TPV
  window.location.assign(
    siblingAppUrl(window.location, 'admin', 5174, import.meta.env.VITE_BACKOFFICE_URL),
  );
}

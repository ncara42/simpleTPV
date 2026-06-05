import { siblingAppUrl } from '@simpletpv/ui';

// Toggle Backoffice/TPV. La derivación de URL vive en @simpletpv/ui (siblingAppUrl);
// aquí solo el destino propio: backoffice → TPV (subdominio tpv, dev :5173).
export function switchApp(app: 'backoffice' | 'tpv'): void {
  if (app === 'backoffice') return; // ya estamos en backoffice
  window.location.assign(siblingAppUrl(window.location, 'tpv', 5173, import.meta.env.VITE_TPV_URL));
}

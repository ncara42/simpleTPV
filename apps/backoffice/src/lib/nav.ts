import { siblingAppUrl } from '@simpletpv/ui';

// Pestañas del backoffice (estado de navegación del shell). Vive aquí para que
// App y la búsqueda de funciones (U-06) compartan el tipo sin import circular.
export type Tab =
  | 'dashboard'
  | 'notifications'
  | 'catalog'
  | 'families'
  | 'stock'
  | 'transfers'
  | 'promotions'
  | 'users'
  | 'timeclock'
  | 'stores'
  | 'sales'
  | 'suppliers'
  | 'verifactu'
  | 'b2b'
  | 'help';

// Toggle Backoffice/TPV. La derivación de URL vive en @simpletpv/ui (siblingAppUrl);
// aquí solo el destino propio: backoffice → TPV (subdominio tpv, dev :5173).
export function switchApp(app: 'backoffice' | 'tpv'): void {
  if (app === 'backoffice') return; // ya estamos en backoffice
  window.location.assign(siblingAppUrl(window.location, 'tpv', 5173, import.meta.env.VITE_TPV_URL));
}

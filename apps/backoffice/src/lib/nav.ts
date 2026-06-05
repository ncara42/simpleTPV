// Navegación entre apps del toggle Backoffice/TPV. En producción la URL del TPV
// se deriva del hostname actual (admin.noelcaravaca.com → tpv.noelcaravaca.com),
// cambiando solo la etiqueta del subdominio. VITE_TPV_URL es un override opcional
// de build y localhost el fallback de dev.
export function siblingAppUrl(
  loc: Pick<Location, 'protocol' | 'hostname'>,
  subdomain: string,
  devPort: number,
  override?: string,
): string {
  if (override) return override;
  const { protocol, hostname } = loc;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return `http://localhost:${devPort}`;
  }
  const parts = hostname.split('.');
  const base = parts.length > 2 ? parts.slice(1).join('.') : hostname;
  return `${protocol}//${subdomain}.${base}`;
}

export function switchApp(app: 'backoffice' | 'tpv'): void {
  if (app === 'backoffice') return; // ya estamos en backoffice
  window.location.assign(siblingAppUrl(window.location, 'tpv', 5173, import.meta.env.VITE_TPV_URL));
}

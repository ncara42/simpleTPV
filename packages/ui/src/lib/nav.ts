// URL de la app hermana para el toggle Backoffice/TPV, compartida por ambas apps.
// En producción la URL se deriva del hostname actual cambiando solo la etiqueta del
// subdominio (p. ej. tpv.dominio.com ↔ admin.dominio.com). `override` es un override
// opcional de build (VITE_*_URL) y localhost el fallback de dev.
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

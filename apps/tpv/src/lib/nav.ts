// Navegación del toggle Backoffice/TPV: navega al backoffice (default local :5174).
export function switchApp(app: 'backoffice' | 'tpv'): void {
  if (app === 'tpv') return; // ya estamos en TPV
  const url = import.meta.env.VITE_BACKOFFICE_URL ?? 'http://localhost:5174';
  window.location.assign(url);
}

// Navegación entre apps del toggle Backoffice/TPV. La URL de la otra app se lee
// de una env var Vite, con default de local (TPV dev en :5173).
export function switchApp(app: 'backoffice' | 'tpv'): void {
  if (app === 'backoffice') return; // ya estamos en backoffice
  const url = import.meta.env.VITE_TPV_URL ?? 'http://localhost:5173';
  window.location.assign(url);
}

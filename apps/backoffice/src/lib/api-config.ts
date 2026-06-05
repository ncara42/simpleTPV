// Toggle demo/real del backoffice. REAL es el DEFAULT (seguro, A-02): solo
// VITE_DEMO_MODE='true' activa el modo demo (login falso ADMIN sin API). Así el
// panel de administración NUNCA cae en demo por omisión; dev, los e2e y la imagen
// de presentación activan demo EXPLÍCITAMENTE (VITE_DEMO_MODE=true).
//
// Es una función (no const) para que sea testeable con vi.stubEnv en runtime y
// porque Vite reemplaza import.meta.env.VITE_DEMO_MODE de forma estática en build.
export function isDemo(): boolean {
  return import.meta.env.VITE_DEMO_MODE === 'true';
}

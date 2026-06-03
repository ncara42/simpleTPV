// Toggle demo/real del TPV. DEMO es el DEFAULT: solo VITE_DEMO_MODE='false' activa
// el modo real (API). Así `pnpm dev` sin backend y los e2e (que no setean la var)
// siguen en demo; producción/QA arranca con VITE_DEMO_MODE=false.
//
// Es una función (no const) para que sea testeable con vi.stubEnv en runtime y
// porque Vite reemplaza import.meta.env.VITE_DEMO_MODE de forma estática en build.
export function isDemo(): boolean {
  return import.meta.env.VITE_DEMO_MODE !== 'false';
}

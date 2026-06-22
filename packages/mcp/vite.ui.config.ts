import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Build de la UI de MCP Apps. Empaqueta `src/ui` en UN ÚNICO HTML con todo el
 * CSS/JS inline (`vite-plugin-singlefile`), apto para el iframe sandbox (CSP
 * deny-by-default) en el que claude.ai renderiza los recursos `ui://`.
 *
 * Reusa los componentes y tokens de `@simpletpv/ui` (se bundlean en el HTML).
 * Sale a `dist/ui/dashboard.html`; el servidor (tools/ui-dashboard.ts) lo lee y
 * lo sirve como recurso `ui://`. No vacía todo `dist` (solo `dist/ui`) para no
 * pisar la compilación del servidor (`tsc`).
 */
export default defineConfig({
  // Raíz = la carpeta de la UI → su `index.html` es el entry y el bundle sale
  // plano en `dist/ui/index.html` (no anidado).
  root: 'src/ui',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '../../dist/ui',
    emptyOutDir: true,
  },
});

import { fileURLToPath } from 'node:url';

import { createViteConfig } from '@simpletpv/web-config/vite';
import { mergeConfig } from 'vite';

// react-draggable (dep de react-grid-layout) hace `if (process.env.DRAGGABLE_DEBUG)`
// SIN guardar `process`, en cada inicio de arrastre (handleDragStart). En dev `process`
// no existe en el navegador → lanza "process is not defined" y las cards no se cogen.
// Lo definimos a `false` para que esbuild/rollup lo sustituyan (dev y build) y el bare
// `process` nunca se evalúe. (NODE_ENV ya lo gestiona Vite.)
export default mergeConfig(createViteConfig({ port: 5174, previewPort: 4174 }), {
  define: { 'process.env.DRAGGABLE_DEBUG': 'false' },
  build: {
    rollupOptions: {
      // Entries: la app real (index.html), el harness de regresión visual (#211, visual.html) y la
      // galería showcase de widgets (#264, gallery.html) — ambas servidas en dev/preview, fuera de
      // la app real.
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        visual: fileURLToPath(new URL('./visual.html', import.meta.url)),
        gallery: fileURLToPath(new URL('./gallery.html', import.meta.url)),
        // Harness de diseño de los widgets Geist con datos reales (#264). Dev/preview, fuera de la app.
        'geist-preview': fileURLToPath(new URL('./geist-preview.html', import.meta.url)),
      },
    },
  },
});

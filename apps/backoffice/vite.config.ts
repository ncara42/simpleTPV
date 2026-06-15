import { createViteConfig } from '@simpletpv/web-config/vite';
import { mergeConfig } from 'vite';

// react-draggable (dep de react-grid-layout) hace `if (process.env.DRAGGABLE_DEBUG)`
// SIN guardar `process`, en cada inicio de arrastre (handleDragStart). En dev `process`
// no existe en el navegador → lanza "process is not defined" y las cards no se cogen.
// Lo definimos a `false` para que esbuild/rollup lo sustituyan (dev y build) y el bare
// `process` nunca se evalúe. (NODE_ENV ya lo gestiona Vite.)
export default mergeConfig(createViteConfig({ port: 5174, previewPort: 4174 }), {
  define: { 'process.env.DRAGGABLE_DEBUG': 'false' },
});

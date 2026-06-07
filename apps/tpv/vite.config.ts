import { createViteConfig } from '@simpletpv/web-config/vite';
import { VitePWA } from 'vite-plugin-pwa';

// El TPV es una PWA: el service worker precachea el app-shell para que el
// terminal CARGUE sin conexión (offline slice 1). La caché de datos (catálogo/
// stock) la gestiona TanStack Query persistido en main.tsx; las ventas offline
// (cola + sync) llegan en la slice 2.
const config = createViteConfig({ port: 5173, previewPort: 4173 });

config.plugins = [
  ...(config.plugins ?? []),
  VitePWA({
    registerType: 'autoUpdate',
    // dev y los e2e demo pueden desactivar el SW con VITE_PWA_DISABLED=true.
    disable: process.env.VITE_PWA_DISABLED === 'true',
    manifest: {
      name: 'simpleTPV — Punto de venta',
      short_name: 'simpleTPV',
      description: 'Terminal de punto de venta simpleTPV',
      lang: 'es',
      display: 'standalone',
      start_url: '/',
      theme_color: '#0b0b0c',
      background_color: '#ffffff',
    },
    workbox: {
      // Precachea el app-shell (JS/CSS/HTML/fuentes) para arranque offline.
      globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
      navigateFallback: '/index.html',
      cleanupOutdatedCaches: true,
    },
  }),
];

export default config;

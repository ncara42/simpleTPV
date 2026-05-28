import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig, type UserConfig } from 'vite';

export interface FrontendViteOptions {
  port: number;
  previewPort: number;
  apiUrl?: string;
}

export function createViteConfig(opts: FrontendViteOptions): UserConfig {
  const apiUrl = opts.apiUrl ?? 'http://localhost:3001';
  return defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
      port: opts.port,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
    preview: {
      port: opts.previewPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve('./src'),
      },
    },
  });
}

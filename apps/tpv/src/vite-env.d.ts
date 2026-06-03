/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_BACKOFFICE_URL?: string;
  // Modo demo del TPV. Default = demo; 'false' cablea la API real (proxy /api → :3001).
  readonly VITE_DEMO_MODE?: string;
}

declare module '*.css';

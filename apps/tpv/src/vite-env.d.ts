/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_BACKOFFICE_URL?: string;
  // Auto-login solo en desarrollo (pruebas). Vacío/ausente = login normal.
  readonly VITE_DEV_AUTOLOGIN_EMAIL?: string;
  readonly VITE_DEV_AUTOLOGIN_PASSWORD?: string;
}

declare module '*.css';

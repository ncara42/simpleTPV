/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_TPV_URL?: string;
  // Canales de soporte (IT-20). Configurables por despliegue; con defaults.
  readonly VITE_SUPPORT_EMAIL?: string;
  readonly VITE_SUPPORT_PHONE?: string;
  readonly VITE_SUPPORT_WHATSAPP?: string;
  // Auto-login solo en desarrollo (pruebas). Vacío/ausente = login normal.
  readonly VITE_DEV_AUTOLOGIN_EMAIL?: string;
  readonly VITE_DEV_AUTOLOGIN_PASSWORD?: string;
}

declare module '*.css';

import * as Sentry from '@sentry/react';

/**
 * Inicializa Sentry SOLO en build de producción (import.meta.env.PROD) y SOLO si
 * hay VITE_SENTRY_DSN. En dev/test → no-op (no contamina los E2E de Playwright).
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || !import.meta.env.PROD) {
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? 'production',
    tracesSampleRate: 0, // solo errores (#79)
  });
}

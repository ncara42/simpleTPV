import * as Sentry from '@sentry/nestjs';

/**
 * Inicializa Sentry SOLO en producción y SOLO si hay DSN configurado.
 * Sin DSN o fuera de producción → no-op (la API funciona igual). Fail-safe,
 * igual que el cache Redis y el webhook de Dokploy del proyecto.
 *
 * Debe llamarse al principio de main.ts, antes de NestFactory.create, para que
 * el SDK instrumente el runtime antes de que arranque la app.
 *
 * @returns true si Sentry se inicializó.
 */
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || process.env.NODE_ENV !== 'production') {
    return false;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0, // solo errores (#79)
    sendDefaultPii: false,
    beforeSend: scrubSensitive,
  });

  return true;
}

/**
 * beforeSend de Sentry: muta el evento in-place (válido para beforeSend) para
 * eliminar cabeceras sensibles como defensa en profundidad, por si el SDK las
 * adjuntara.
 */
function scrubSensitive<T extends Record<string, unknown>>(event: T): T {
  const request = event.request as { headers?: Record<string, unknown> } | undefined;
  if (request?.headers) {
    delete request.headers.authorization;
    delete request.headers.cookie;
  }
  return event;
}

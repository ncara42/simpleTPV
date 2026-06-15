import * as Sentry from '@sentry/nestjs';

import { getCurrentTenant } from '../prisma/tenant-context.js';

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
 * Campos sensibles que se borran de `event.extra` en capturas manuales
 * (`captureException` con contexto extra) por si arrastran credenciales.
 */
const SENSITIVE_EXTRA_KEYS = ['password', 'token', 'secret', 'authorization'] as const;

/**
 * beforeSend de Sentry: muta el evento in-place (válido para beforeSend) para
 * eliminar datos sensibles como defensa en profundidad, por si el SDK los
 * adjuntara. Borra:
 * - Cabeceras `authorization` y `cookie` de la request.
 * - `request.data` (el body), que en endpoints de login/registro/cambio de
 *   contraseña podría contener la contraseña en claro (CFG-08, CWE-532).
 * - Campos sensibles en `event.extra` para futuros `captureException` manuales.
 *
 * También etiqueta el evento con el organization_id del tenant actual
 * (AsyncLocalStorage) para filtrar fácilmente por organización en el panel de Sentry.
 */
function scrubSensitive(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const headers = event.request?.headers;
  if (headers) {
    delete headers.authorization;
    delete headers.cookie;
  }

  if (event.request) {
    delete event.request.data;
  }

  if (event.extra) {
    for (const key of SENSITIVE_EXTRA_KEYS) {
      delete event.extra[key];
    }
  }

  const tenant = getCurrentTenant();
  if (tenant) {
    event.tags = { ...event.tags, organization_id: tenant.organizationId };
  }

  return event;
}

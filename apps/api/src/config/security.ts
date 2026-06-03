// Helpers puros de configuración de seguridad (testeables sin arrancar Nest).

// Orígenes CORS permitidos en desarrollo: los frontends (TPV y backoffice) en sus
// puertos de dev (vite) y preview.
export const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'http://localhost:4174',
];

// Parsea CORS_ORIGINS (CSV) → lista de orígenes. Recorta espacios y descarta
// entradas vacías. Sin la env (o vacía) → orígenes de dev por defecto.
export function parseCorsOrigins(env: string | undefined): string[] {
  if (!env || env.trim() === '') {
    return [...DEFAULT_DEV_ORIGINS];
  }
  return env
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

// Config de rate limiting desde env (con defaults holgados para el TPV).
export function throttleConfig(env: NodeJS.ProcessEnv): { ttl: number; limit: number } {
  const ttl = Number(env.THROTTLE_TTL ?? 60000);
  const limit = Number(env.THROTTLE_LIMIT ?? 120);
  return {
    ttl: Number.isFinite(ttl) && ttl > 0 ? ttl : 60000,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 120,
  };
}

// Máximo de conexiones SSE (/events) concurrentes por usuario y réplica. Cada
// suscripción SSE abre una conexión Redis dedicada (RedisEventBus); sin tope, un
// usuario autenticado podría abrir cientos y agotar las conexiones de Redis o los
// sockets del proceso (auditoría SEC-03). Default holgado para uso legítimo
// (varias pestañas/dispositivos), suficiente para cortar el abuso.
export function sseMaxConnectionsPerUser(env: NodeJS.ProcessEnv): number {
  const n = Number(env.SSE_MAX_CONNECTIONS_PER_USER ?? 5);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}

import type { RedisOptions } from 'bullmq';

// Opciones de retención de jobs para BullMQ. Sin ellas, BullMQ acumula los jobs
// completados y fallidos indefinidamente en Redis → fuga de memoria (DOS-01). Se
// fija un tope de historial: los más antiguos se purgan al superar el `count`.
export const JOB_RETENTION = {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
} as const;

// Construye las RedisOptions de una conexión BullMQ a partir de REDIS_URL.
// Centraliza el parseo (antes duplicado en cada servicio con cola) y, sobre todo,
// detecta el esquema `rediss:` para forzar TLS con verificación de certificado
// (DOS-07/INFRA-03): si la URL pide TLS pero solo se pasan host/port/password, la
// conexión viajaría en claro. ioredis (cache/eventos) ya lo hace al recibir la URL
// entera; aquí lo replicamos para las colas, que construyen las opciones a mano.
export function redisOptionsFromUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  const isTls = parsed.protocol === 'rediss:';
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.password ? { password: parsed.password } : {}),
    ...(isTls ? { tls: { rejectUnauthorized: true } } : {}),
  };
}

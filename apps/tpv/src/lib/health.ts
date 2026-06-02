// Hook de health-check del TPV (#34). En modo demo no hay backend que vigilar,
// así que devuelve siempre `healthy=true` sin hacer ping a /health (evita el
// bloqueo del cobro y el ruido de errores de proxy). La firma se conserva para
// no tocar SalePage.
export function useHealthCheck(_intervalMs = 10_000, _timeoutMs = 3_000): boolean {
  return true;
}

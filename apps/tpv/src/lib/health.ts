// Hook de health-check del TPV (#34). En modo demo no hay backend que vigilar,
// así que devuelve siempre `healthy=true` sin hacer ping a /health (evita el
// bloqueo del cobro y el ruido de errores de proxy). La firma se conserva para
// no tocar SalePage.
//
// @deprecated Stub permanente: SIEMPRE devuelve `true` y NO comprueba la salud
// real de la API. El bloqueo del cobro por API caída está DESACTIVADO. No
// confíes en su valor como señal de disponibilidad; implementa el ping real a
// `/health` antes de reactivar cualquier bloqueo por salud.
export function useHealthCheck(_intervalMs = 10_000, _timeoutMs = 3_000): boolean {
  return true;
}

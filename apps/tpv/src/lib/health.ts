import { useEffect, useRef, useState } from 'react';

// Hook de health-check del TPV (#34). Hace ping a GET /health cada `intervalMs`;
// si la API no responde en `timeoutMs`, marca isHealthy=false → el TPV muestra
// estado degradado y bloquea el cobro. Al recuperar, vuelve a true.
//
// /health es público (sin token), así que usamos fetch directo contra /api.
export function useHealthCheck(intervalMs = 10_000, timeoutMs = 3_000): boolean {
  const [healthy, setHealthy] = useState(true);
  // Evita actualizar estado tras desmontar.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const ping = async (): Promise<void> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch('/api/health', { signal: controller.signal });
        if (mounted.current) {
          setHealthy(res.ok);
        }
      } catch {
        if (mounted.current) {
          setHealthy(false);
        }
      } finally {
        clearTimeout(timer);
      }
    };

    void ping();
    const id = setInterval(() => void ping(), intervalMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [intervalMs, timeoutMs]);

  return healthy;
}

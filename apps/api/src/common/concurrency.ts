// Utilidad para acotar la concurrencia de trabajo asíncrono CPU-bound.
//
// Los imports en lote hashean contraseñas con bcrypt (CPU-bound, ~100 ms c/u).
// Un `Promise.all` sobre las 500 filas del tope dispara 500 hashes a la vez y
// satura el event loop de Node, degradando toda la API para el resto de tenants
// del proceso (DoS autenticado, DOS-03). Procesar en lotes de tamaño acotado
// mantiene el throughput sin monopolizar la CPU.

// Aplica `fn` a cada elemento de `items` con un máximo de `limit` ejecuciones en
// vuelo simultáneas. Preserva el orden de los resultados respecto a la entrada.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (limit < 1) {
    throw new Error('El límite de concurrencia debe ser >= 1');
  }
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const current = next;
      next += 1;
      results[current] = await fn(items[current]!, current);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

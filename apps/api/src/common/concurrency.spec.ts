import { describe, expect, it } from 'vitest';

import { mapWithConcurrency } from './concurrency.js';

describe('mapWithConcurrency', () => {
  it('preserva el orden de los resultados respecto a la entrada', async () => {
    const items = [1, 2, 3, 4, 5];
    const res = await mapWithConcurrency(items, 2, async (n) => n * 10);
    expect(res).toEqual([10, 20, 30, 40, 50]);
  });

  it('nunca supera el límite de ejecuciones simultáneas', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 50 }, (_, i) => i);
    await mapWithConcurrency(items, 10, async (n) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Cede el turno para forzar solapamiento real entre tareas.
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return n;
    });
    expect(maxInFlight).toBeLessThanOrEqual(10);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('devuelve un array vacío sin lanzar workers para una entrada vacía', async () => {
    const res = await mapWithConcurrency([], 10, async (n: number) => n);
    expect(res).toEqual([]);
  });

  it('lanza si el límite es menor que 1', async () => {
    await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toThrow(/límite/);
  });
});

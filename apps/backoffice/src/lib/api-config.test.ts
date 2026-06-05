import { afterEach, describe, expect, it, vi } from 'vitest';

import { isDemo } from './api-config.js';

// A-02: el modo demo es OPT-IN. Solo VITE_DEMO_MODE === 'true' lo activa; cualquier
// otro valor (o ausente) deja el modo REAL, para que el panel de administración nunca
// quede con login ADMIN falso por omisión.
describe('isDemo (demo opt-in)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('activa demo solo con VITE_DEMO_MODE === "true"', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    expect(isDemo()).toBe(true);
  });

  it('cualquier otro valor → modo real (false)', () => {
    for (const v of ['false', '1', 'TRUE', '']) {
      vi.stubEnv('VITE_DEMO_MODE', v);
      expect(isDemo()).toBe(false);
    }
  });
});

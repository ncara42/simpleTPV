import type { FeatureFlags } from '@simpletpv/auth';

import { isDemo } from './api-config.js';
import { api } from './auth.js';

export type { FeatureFlags };

// Feature flags (#127 B): estado efectivo de los módulos para ocultar/des­habilitar
// UI. El backend (GET /me/features) es la fuente de verdad; esto solo informa a la
// UI. En demo todos los módulos están activos (la demo muestra todo). La gestión
// (activar/desactivar) y el ocultado de UI llegan en el slice 2.
const DEMO_FEATURES: FeatureFlags = {
  blind_returns: true,
  time_clock: true,
  data_export: true,
  b2b: true,
};

export function getFeatures(storeId?: string): Promise<FeatureFlags> {
  if (isDemo()) return Promise.resolve({ ...DEMO_FEATURES });
  return api.get<FeatureFlags>('/me/features', storeId ? { storeId } : {});
}

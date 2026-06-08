import type { FeatureFlags } from '@simpletpv/auth';
import { useQuery } from '@tanstack/react-query';

import { isDemo } from './api-config.js';
import { api } from './auth.js';

export type { FeatureFlags };

// Mientras carga (o en demo), no ocultamos nada: el backend es la fuente de verdad
// (devuelve 403 si el módulo está apagado). El TPV opera sobre una tienda concreta,
// así que resuelve los flags a nivel de esa tienda (override de tienda ?? org ?? código).
export const ALL_ENABLED: FeatureFlags = {
  blind_returns: true,
  time_clock: true,
  data_export: true,
  b2b: true,
};

function getFeatures(storeId?: string): Promise<FeatureFlags> {
  if (isDemo()) return Promise.resolve({ ...ALL_ENABLED });
  return api.get<FeatureFlags>('/me/features', storeId ? { storeId } : {});
}

// Hook para ocultar UI del TPV (fichaje, devolución ciega) según los flags de la
// tienda activa. Devuelve todo-activo mientras carga o sin tienda.
export function useFeatures(storeId?: string | null): FeatureFlags {
  const { data } = useQuery({
    queryKey: ['features', storeId ?? 'org'],
    queryFn: () => getFeatures(storeId ?? undefined),
    staleTime: 5 * 60 * 1000,
    enabled: storeId !== null,
  });
  return data ?? ALL_ENABLED;
}

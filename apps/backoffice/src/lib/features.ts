import type { FeatureFlags } from '@simpletpv/auth';
import { useQuery } from '@tanstack/react-query';

import { api } from './auth.js';

export type { FeatureFlags };

const ALL_ENABLED: FeatureFlags = {
  blind_returns: true,
  time_clock: true,
  data_export: true,
  b2b: true,
};

export function getFeatures(storeId?: string): Promise<FeatureFlags> {
  return api.get<FeatureFlags>('/me/features', storeId ? { storeId } : {});
}

// Lee los módulos activos (resolución tienda ?? org ?? código en el backend) para
// ocultar entradas del menú. La GESTIÓN de flags por UI se retiró con la página
// "Módulos" (informe UX); el backend de feature-flags sigue activo y los flags se
// fijan por seed/config.
export function useFeatures(storeId?: string): FeatureFlags {
  const { data } = useQuery({
    queryKey: ['features', storeId ?? 'org'],
    queryFn: () => getFeatures(storeId),
    staleTime: 5 * 60 * 1000,
  });
  return data ?? ALL_ENABLED;
}

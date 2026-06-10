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

function getFeatures(storeId?: string): Promise<FeatureFlags> {
  return api.get<FeatureFlags>('/me/features', storeId ? { storeId } : {});
}

export function useFeatures(storeId?: string | null): FeatureFlags {
  const { data } = useQuery({
    queryKey: ['features', storeId ?? 'org'],
    queryFn: () => getFeatures(storeId ?? undefined),
    staleTime: 5 * 60 * 1000,
    enabled: storeId !== null,
  });
  return data ?? ALL_ENABLED;
}

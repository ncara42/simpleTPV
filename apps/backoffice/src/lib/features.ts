import type {
  FeatureFlagCatalogEntry,
  FeatureFlagRow,
  FeatureFlags,
  FeatureFlagsAdmin,
  FeatureKey,
} from '@simpletpv/auth';
import { useQuery } from '@tanstack/react-query';

import { api } from './auth.js';

export type {
  FeatureFlagCatalogEntry,
  FeatureFlagRow,
  FeatureFlags,
  FeatureFlagsAdmin,
  FeatureKey,
};

export const ALL_ENABLED: FeatureFlags = {
  blind_returns: true,
  time_clock: true,
  data_export: true,
  b2b: true,
};

export function getFeatures(storeId?: string): Promise<FeatureFlags> {
  return api.get<FeatureFlags>('/me/features', storeId ? { storeId } : {});
}

export function useFeatures(storeId?: string): FeatureFlags {
  const { data } = useQuery({
    queryKey: ['features', storeId ?? 'org'],
    queryFn: () => getFeatures(storeId),
    staleTime: 5 * 60 * 1000,
  });
  return data ?? ALL_ENABLED;
}

export function listFeatureFlags(): Promise<FeatureFlagsAdmin> {
  return api.get<FeatureFlagsAdmin>('/feature-flags');
}

export function setFeatureFlag(key: FeatureKey, enabled: boolean, storeId?: string): Promise<void> {
  return api.put<void>('/feature-flags', { key, enabled, ...(storeId ? { storeId } : {}) });
}

export function clearFeatureFlag(key: FeatureKey, storeId?: string): Promise<void> {
  return api.del(`/feature-flags/${key}${storeId ? `?storeId=${storeId}` : ''}`);
}

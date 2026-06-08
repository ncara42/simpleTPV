import type {
  FeatureFlagCatalogEntry,
  FeatureFlagRow,
  FeatureFlags,
  FeatureFlagsAdmin,
  FeatureKey,
} from '@simpletpv/auth';
import { useQuery } from '@tanstack/react-query';

import { isDemo } from './api-config.js';
import { api } from './auth.js';

export type {
  FeatureFlagCatalogEntry,
  FeatureFlagRow,
  FeatureFlags,
  FeatureFlagsAdmin,
  FeatureKey,
};

// Mientras carga, no ocultamos nada (todo activo) para evitar parpadeo de UI que
// aparece y desaparece. El backend es la fuente de verdad (403 si está apagado).
export const ALL_ENABLED: FeatureFlags = {
  blind_returns: true,
  time_clock: true,
  data_export: true,
  b2b: true,
};

// ── Estado demo (mutable en memoria) ─────────────────────────────────────────
// Catálogo fijo + filas explícitas que la matriz de Módulos muta; getFeatures
// resuelve sobre ellas, así que apagar un módulo en la demo oculta su UI de verdad.
const DEMO_CATALOG: FeatureFlagCatalogEntry[] = [
  { key: 'blind_returns', label: 'Devolución ciega', default: true },
  { key: 'time_clock', label: 'Control horario', default: true },
  { key: 'data_export', label: 'Exportación (ventas y contable)', default: true },
  { key: 'b2b', label: 'Mayorista B2B', default: true },
];
let demoFlags: FeatureFlagRow[] = [];

function resolveDemo(storeId?: string): FeatureFlags {
  const out = {} as FeatureFlags;
  for (const c of DEMO_CATALOG) {
    const store = storeId
      ? demoFlags.find((f) => f.key === c.key && f.storeId === storeId)
      : undefined;
    const org = demoFlags.find((f) => f.key === c.key && f.storeId === null);
    out[c.key] = store?.enabled ?? org?.enabled ?? c.default;
  }
  return out;
}

// ── Lectura (estado efectivo, para ocultar UI) ───────────────────────────────
export function getFeatures(storeId?: string): Promise<FeatureFlags> {
  if (isDemo()) return Promise.resolve(resolveDemo(storeId));
  return api.get<FeatureFlags>('/me/features', storeId ? { storeId } : {});
}

// Hook para ocultar UI según los flags efectivos (a nivel org si no se pasa tienda).
// Devuelve todo-activo mientras carga: nunca ocultamos antes de saber.
export function useFeatures(storeId?: string): FeatureFlags {
  const { data } = useQuery({
    queryKey: ['features', storeId ?? 'org'],
    queryFn: () => getFeatures(storeId),
    staleTime: 5 * 60 * 1000,
  });
  return data ?? ALL_ENABLED;
}

// ── Gestión (matriz de Módulos; ADMIN/MANAGER) ───────────────────────────────
export function listFeatureFlags(): Promise<FeatureFlagsAdmin> {
  if (isDemo()) {
    return Promise.resolve({
      catalog: DEMO_CATALOG.map((c) => ({ ...c })),
      flags: demoFlags.map((f) => ({ ...f })),
    });
  }
  return api.get<FeatureFlagsAdmin>('/feature-flags');
}

export function setFeatureFlag(key: FeatureKey, enabled: boolean, storeId?: string): Promise<void> {
  if (isDemo()) {
    const sid = storeId ?? null;
    const existing = demoFlags.find((f) => f.key === key && f.storeId === sid);
    if (existing) existing.enabled = enabled;
    else demoFlags.push({ key, storeId: sid, enabled });
    return Promise.resolve();
  }
  return api.put<void>('/feature-flags', { key, enabled, ...(storeId ? { storeId } : {}) });
}

export function clearFeatureFlag(key: FeatureKey, storeId?: string): Promise<void> {
  if (isDemo()) {
    const sid = storeId ?? null;
    demoFlags = demoFlags.filter((f) => !(f.key === key && f.storeId === sid));
    return Promise.resolve();
  }
  return api.del(`/feature-flags/${key}${storeId ? `?storeId=${storeId}` : ''}`);
}

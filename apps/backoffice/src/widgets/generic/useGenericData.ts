import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api } from '../../lib/auth.js';
import type { GenericSpec } from '../../lib/dashboard-layout.js';

// Construye los query params de un widget genérico: sus `params` + period/storeId.
// El cliente `api` espera Record<string, string | null | undefined>, así que todo se
// serializa a texto. Los valores nulos/ausentes se omiten.
export function buildGenericQuery(spec: GenericSpec): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(spec.params ?? {})) {
    if (value !== null && value !== undefined) query[key] = String(value);
  }
  if (spec.period) query.period = spec.period;
  if (spec.storeId) query.storeId = spec.storeId;
  return query;
}

// TanStack Query contra el endpoint del widget (relativo a la base del API). La key
// incluye endpoint + query para revalidar al cambiar period/storeId. Devuelve `unknown`:
// cada componente sabe cómo mapear su forma de datos según `spec.fields`.
export function useGenericData(spec: GenericSpec) {
  const query = buildGenericQuery(spec);
  return useQuery<unknown>({
    queryKey: ['generic-widget', spec.endpoint, query],
    queryFn: () => api.get<unknown>(spec.endpoint, query),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

// Normaliza la respuesta de un endpoint a un array de registros. Acepta:
//  - un array directo;
//  - un objeto con una única propiedad array (p. ej. `{ byStore: [...] }`);
//  - un objeto plano → se envuelve como un único registro.
export function toRecords(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === 'object') {
    const arrayProp = Object.values(data).find((v) => Array.isArray(v));
    if (Array.isArray(arrayProp)) return arrayProp as Array<Record<string, unknown>>;
    return [data as Record<string, unknown>];
  }
  return [];
}

// Lee un campo numérico de un registro (tolerante a strings tipo "17.90").
export function numField(row: Record<string, unknown>, field: string): number {
  const v = row[field];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// Lee un campo como texto (label de eje/porción).
export function textField(row: Record<string, unknown>, field: string): string {
  const v = row[field];
  return v == null ? '' : String(v);
}

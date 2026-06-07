import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isDemo } from './api-config.js';
import { api } from './auth.js';

// Personalización por usuario (IT-16). En real va contra /me/preferences; en demo se
// persiste en localStorage para que la personalización sobreviva a recargas sin backend.
const DEMO_KEY = 'simpletpv-demo-prefs';

function demoRead(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) ?? '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function getPreferences(): Promise<Record<string, unknown>> {
  if (isDemo()) return Promise.resolve(demoRead());
  return api.get<Record<string, unknown>>('/me/preferences');
}

export function setPreference(
  key: string,
  value: unknown,
): Promise<{ key: string; value: unknown }> {
  if (isDemo()) {
    const all = demoRead();
    all[key] = value;
    localStorage.setItem(DEMO_KEY, JSON.stringify(all));
    return Promise.resolve({ key, value });
  }
  return api.put<{ key: string; value: unknown }>(`/me/preferences/${key}`, { value });
}

// Carga todas las preferencias y expone un setter optimista (cachea por clave).
// `loaded` permite aplicar valores por defecto una sola vez tras la carga inicial.
export function usePreferences() {
  const qc = useQueryClient();
  const { data, isSuccess } = useQuery({
    queryKey: ['preferences'],
    queryFn: getPreferences,
    staleTime: Infinity, // solo cambian vía nuestra mutación; sin refetch espurio
  });
  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => setPreference(key, value),
    // Optimista y SÍNCRONO (onMutate): la UI controlada refleja el cambio al instante,
    // sin esperar al backend. La persistencia ocurre en mutationFn.
    onMutate: ({ key, value }) => {
      qc.setQueryData<Record<string, unknown>>(['preferences'], (prev) => ({
        ...(prev ?? {}),
        [key]: value,
      }));
    },
  });
  return {
    prefs: data ?? {},
    loaded: isSuccess,
    setPref: (key: string, value: unknown) => mutation.mutate({ key, value }),
  };
}

// Lee una preferencia tipada con un valor por defecto.
export function readPref<T>(prefs: Record<string, unknown>, key: string, fallback: T): T {
  const v = prefs[key];
  return v === undefined || v === null ? fallback : (v as T);
}

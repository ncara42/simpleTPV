import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './auth.js';

export function getPreferences(): Promise<Record<string, unknown>> {
  return api.get<Record<string, unknown>>('/me/preferences');
}

export function setPreference(
  key: string,
  value: unknown,
): Promise<{ key: string; value: unknown }> {
  return api.put<{ key: string; value: unknown }>(`/me/preferences/${key}`, { value });
}

export function usePreferences() {
  const qc = useQueryClient();
  const { data, isSuccess } = useQuery({
    queryKey: ['preferences'],
    queryFn: getPreferences,
    staleTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => setPreference(key, value),
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

export function readPref<T>(prefs: Record<string, unknown>, key: string, fallback: T): T {
  const v = prefs[key];
  return v === undefined || v === null ? fallback : (v as T);
}

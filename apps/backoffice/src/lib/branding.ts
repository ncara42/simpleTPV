import { applyBrandColor, type Branding } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from './auth.js';

export type { Branding };

export function getBranding(): Promise<Branding> {
  return api.get<Branding>('/organization/branding');
}

export function updateBranding(input: Partial<Branding>): Promise<Branding> {
  return api.patch<Branding>('/organization/branding', input);
}

// U-08: aplica el tema corporativo al arrancar (y al cambiar). Devuelve la marca
// para quien necesite el logo (el shell lo pasa al Sidebar).
export function useBranding(): Branding | undefined {
  const { data } = useQuery({ queryKey: ['org-branding'], queryFn: getBranding });
  useEffect(() => {
    applyBrandColor(data?.brandColor ?? null);
  }, [data?.brandColor]);
  return data;
}

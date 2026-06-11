import { applyBrandColor, type Branding } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from './auth.js';

// U-08: el TPV aplica el mismo tema corporativo que el backoffice al arrancar.
export function useBranding(): Branding | undefined {
  const { data } = useQuery({
    queryKey: ['org-branding'],
    queryFn: () => api.get<Branding>('/organization/branding'),
  });
  useEffect(() => {
    applyBrandColor(data?.brandColor ?? null);
  }, [data?.brandColor]);
  return data;
}

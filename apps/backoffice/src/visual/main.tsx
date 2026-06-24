import '@simpletpv/ui/theme.css';
import '@simpletpv/ui/theme-geist.css';
import '@simpletpv/ui/chart.css';
import '@simpletpv/ui/datatable.css';
import '@simpletpv/ui/dataviz.css';
import './visual.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { VisualHarness } from './VisualHarness.js';

// Sin reintentos ni refetch: el harness es determinista (datos mock vía stub de red en Playwright).
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, gcTime: Infinity } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <VisualHarness />
    </QueryClientProvider>
  </StrictMode>,
);

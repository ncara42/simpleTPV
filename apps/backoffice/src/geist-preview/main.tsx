import '../styles.css';
import '@simpletpv/ui/chart.css';
import '@simpletpv/ui/dataviz.css';
import '@simpletpv/ui/select.css';
import '../catalog.css';
import '../dashboard.css';
import './geist-preview.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { GeistPreview } from './GeistPreview.js';

// Harness de DISEÑO (dev/preview, fuera de la app): monta los 16 widgets Geist con datos REALES
// (auto-login contra la API local) y un selector de periodo, para revisarlos uno a uno con Playwright.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <GeistPreview />
    </QueryClientProvider>
  </StrictMode>,
);

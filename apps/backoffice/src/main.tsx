import './styles.css';

import * as Sentry from '@sentry/react';
import { ErrorScreen } from '@simpletpv/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sileo';

import App from './App.js';
import { ConfirmProvider } from './components/ConfirmProvider.js';
import { initSentry } from './observability/sentry.js';

initSentry();

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ErrorBoundary siempre activo: ante un crash de render muestra ErrorScreen
        en vez de pantalla en blanco. Solo reporta a Sentry si initSentry() inicializó
        el SDK (producción con DSN); en dev/test actúa como boundary normal. */}
    <Sentry.ErrorBoundary fallback={<ErrorScreen />}>
      <QueryClientProvider client={queryClient}>
        <Toaster position="bottom-right" />
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);

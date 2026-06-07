import './styles.css';

import * as Sentry from '@sentry/react';
import { ErrorScreen } from '@simpletpv/ui';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.js';
import { initSentry } from './observability/sentry.js';

initSentry();

const DAY_MS = 1000 * 60 * 60 * 24;

// gcTime alto + networkMode 'offlineFirst': la caché vive en memoria todo el día
// y, sin conexión, las queries sirven el último dato cacheado en vez de quedarse
// en loading. El persister la vuelca a localStorage para que catálogo/stock estén
// disponibles tras recargar el TPV offline (PWA, offline slice 1).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: DAY_MS,
      staleTime: 1000 * 60 * 5,
      networkMode: 'offlineFirst',
      retry: 1,
    },
  },
});

// Persistencia síncrona en localStorage (el dataset de catálogo/stock es pequeño;
// no requiere IndexedDB). Clave namespaced por app.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'simpletpv.tpv.qcache',
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ErrorBoundary siempre activo: ante un crash de render muestra ErrorScreen
        en vez de pantalla en blanco. Solo reporta a Sentry si initSentry() inicializó
        el SDK (producción con DSN); en dev/test actúa como boundary normal. */}
    <Sentry.ErrorBoundary fallback={<ErrorScreen />}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: DAY_MS }}
      >
        <App />
      </PersistQueryClientProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);

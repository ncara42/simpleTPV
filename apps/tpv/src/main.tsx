import './styles.css';

import * as Sentry from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.js';
import { ErrorScreen } from './observability/ErrorScreen.js';
import { initSentry } from './observability/sentry.js';

initSentry();

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorScreen />}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./lib/stock.js', () => ({ listAlerts: vi.fn(() => Promise.resolve([])) }));
vi.mock('./lib/auth.js', () => ({ api: { subscribeEvents: vi.fn(() => () => {}) } }));

import { NotificationsPage } from './NotificationsPage.js';

describe('NotificationsPage', () => {
  it('muestra el portal de notificaciones (vacío sin alertas)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <NotificationsPage />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('notifications-page')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('alerts-empty')).toBeInTheDocument());
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GenericSpec } from '../../lib/dashboard-layout.js';

// Mock del cliente API (no de GenericWidget): así ejercitamos el despachador REAL y el ciclo de
// imports GenericWidget ↔ GenericComposite, igual que en el navegador.
const getMock = vi.fn();
vi.mock('../../lib/auth.js', () => ({ api: { get: (...args: unknown[]) => getMock(...args) } }));

import { GenericWidget } from './GenericWidget.js';

function renderWithClient(node: React.ReactElement): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

// Spec EXACTO tal como queda persistido en la BD tras la normalización (caso real del agente).
const compositeSpec: GenericSpec = {
  type: 'composite',
  title: 'Ventas del mes — Por vendedor y por familia',
  endpoint: '',
  defaultSize: { h: 5, w: 8 },
  root: {
    kind: 'stack',
    dir: 'row',
    gap: 8,
    children: [
      {
        kind: 'leaf',
        span: 1,
        title: 'Por vendedor',
        spec: {
          type: 'bar',
          title: 'Widget',
          fields: ['userName', 'total'],
          params: { period: 'month' },
          endpoint: '/dashboard/sales-by-employee',
          defaultSize: { h: 2, w: 6 },
        },
      },
      {
        kind: 'leaf',
        span: 1,
        title: 'Por familia',
        spec: {
          type: 'pie',
          title: 'Widget',
          fields: ['familyName', 'total'],
          params: { period: 'month' },
          endpoint: '/dashboard/sales-by-family',
          defaultSize: { h: 3, w: 4 },
        },
      },
    ],
  },
};

describe('GenericWidget despacha composite (ciclo real, sin mock)', () => {
  it('renderiza la tarjeta compuesta con sus dos hojas (no lanza por el import circular)', async () => {
    getMock.mockResolvedValue([
      { userName: 'Dependiente Demo', total: 73157.79 },
      { familyName: 'Aceites', total: 20373 },
    ]);
    renderWithClient(<GenericWidget spec={compositeSpec} />);
    // Título de la tarjeta + títulos de sección de cada hoja → confirma que el árbol se pinta.
    expect(screen.getByText('Ventas del mes — Por vendedor y por familia')).toBeInTheDocument();
    expect(screen.getByText('Por vendedor')).toBeInTheDocument();
    expect(screen.getByText('Por familia')).toBeInTheDocument();
    // Cada hoja hizo su fetch al endpoint correspondiente.
    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith('/dashboard/sales-by-employee', { period: 'month' }),
    );
    expect(getMock).toHaveBeenCalledWith('/dashboard/sales-by-family', { period: 'month' });
  });
});

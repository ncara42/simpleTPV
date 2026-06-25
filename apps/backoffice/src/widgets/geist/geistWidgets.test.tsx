import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mock del cliente API: todas las getters de dashboard/stock pasan por `api.get`. Devolvemos `[]`
// (forma neutra) — los componentes son null-safe, así que pintan su estado vacío sin lanzar.
const getMock = vi.fn();
vi.mock('../../lib/auth.js', () => ({ api: { get: (...args: unknown[]) => getMock(...args) } }));

import { ITEM_SPECS } from '../../lib/dashboard-layout.js';
import { WIDGET_LABELS } from '../registry.js';
import { GEIST_RENDER_IDS, GeistWidget } from './geistWidgets.js';
import { GEIST_WIDGET_IDS, GEIST_WIDGET_META, isGeistWidget } from './meta.js';

function renderWithClient(node: ReactElement): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('catálogo Geist (#264)', () => {
  it('monta exactamente 16 widgets', () => {
    expect(GEIST_WIDGET_IDS).toHaveLength(16);
  });

  it('el conjunto de render coincide con el de meta (sin huérfanos en ningún lado)', () => {
    expect([...GEIST_RENDER_IDS].sort()).toEqual([...GEIST_WIDGET_IDS].sort());
  });

  it('cada widget Geist está en ITEM_SPECS y WIDGET_LABELS con tamaño y etiqueta válidos', () => {
    for (const id of GEIST_WIDGET_IDS) {
      expect(isGeistWidget(id), `isGeistWidget(${id})`).toBe(true);
      expect(ITEM_SPECS[id], `ITEM_SPECS falta ${id}`).toBeDefined();
      expect(ITEM_SPECS[id]!.w).toBeGreaterThan(0);
      expect(ITEM_SPECS[id]!.h).toBeGreaterThan(0);
      expect(WIDGET_LABELS[id], `WIDGET_LABELS falta ${id}`).toBeTruthy();
      expect(GEIST_WIDGET_META[id]!.label).toBe(WIDGET_LABELS[id]);
    }
  });
});

describe('GeistWidget', () => {
  it('devuelve null para un id que no es Geist', () => {
    renderWithClient(<GeistWidget id="dash-bars" period="today" />);
    expect(screen.queryByTestId('dash-bars')).not.toBeInTheDocument();
  });

  it.each(GEIST_RENDER_IDS)('renderiza el panel del widget %s sin lanzar', async (id) => {
    getMock.mockResolvedValue([]);
    renderWithClient(<GeistWidget id={id} period="today" />);
    // El panel (con su data-testid) se monta de inmediato; el fetch resuelve en microtask.
    expect(await screen.findByTestId(id)).toBeInTheDocument();
  });
});

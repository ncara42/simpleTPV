import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Store } from './lib/admin.js';

const STORES: Store[] = [{ id: 's1', name: 'Centro', code: '01', address: null, active: true }];

vi.mock('./lib/admin.js', () => ({
  listStores: vi.fn(() => Promise.resolve(STORES)),
}));

vi.mock('./lib/features.js', () => ({
  listFeatureFlags: vi.fn(() =>
    Promise.resolve({
      catalog: [
        { key: 'b2b', label: 'Mayorista B2B', default: true },
        { key: 'time_clock', label: 'Control horario', default: true },
      ],
      // b2b apagado a nivel org; el resto sin fila (Por defecto).
      flags: [{ key: 'b2b', storeId: null, enabled: false }],
    }),
  ),
  setFeatureFlag: vi.fn(() => Promise.resolve()),
  clearFeatureFlag: vi.fn(() => Promise.resolve()),
}));

import { listStores } from './lib/admin.js';
import { clearFeatureFlag, listFeatureFlags, setFeatureFlag } from './lib/features.js';
import { ModulesPage } from './ModulesPage.js';

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ModulesPage />
    </QueryClientProvider>,
  );
}

describe('ModulesPage', () => {
  it('pinta la matriz: una fila por módulo y columnas Org + tiendas', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('modules-matrix')).toBeInTheDocument());
    expect(screen.getAllByTestId('modules-row')).toHaveLength(2);
    // b2b está apagado a nivel org → la celda Org refleja 'off'.
    const orgCell = screen.getByTestId('modules-cell-b2b-org') as HTMLSelectElement;
    expect(orgCell.value).toBe('off');
    // Sin fila para la tienda → 'default' (hereda).
    const storeCell = screen.getByTestId('modules-cell-b2b-s1') as HTMLSelectElement;
    expect(storeCell.value).toBe('default');
    expect(listStores).toHaveBeenCalled();
    expect(listFeatureFlags).toHaveBeenCalled();
  });

  it('activar una celda llama a setFeatureFlag; "Por defecto" llama a clearFeatureFlag', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('modules-matrix')).toBeInTheDocument());

    // Enciende b2b en la tienda s1 → setFeatureFlag('b2b', true, 's1').
    fireEvent.change(screen.getByTestId('modules-cell-b2b-s1'), { target: { value: 'on' } });
    await waitFor(() => expect(setFeatureFlag).toHaveBeenCalledWith('b2b', true, 's1'));

    // Vuelve la celda Org de b2b a "Por defecto" → clearFeatureFlag('b2b', undefined).
    fireEvent.change(screen.getByTestId('modules-cell-b2b-org'), { target: { value: 'default' } });
    await waitFor(() => expect(clearFeatureFlag).toHaveBeenCalledWith('b2b', undefined));
  });
});

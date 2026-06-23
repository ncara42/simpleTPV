import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./products.js', () => ({
  updateProduct: vi.fn(),
}));

import { updateProduct } from './products.js';
import { useAssignProductsToFamily } from './use-assign-products-to-family.js';

const mockUpdate = vi.mocked(updateProduct);

function makeWrapper(): { wrapper: (p: { children: ReactNode }) => ReactNode; qc: QueryClient } {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }): ReactNode =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { wrapper, qc };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAssignProductsToFamily (S-18)', () => {
  it('emite N PATCH en paralelo, uno por producto, con el familyId destino', async () => {
    // Arrange
    mockUpdate.mockResolvedValue({} as never);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAssignProductsToFamily(), { wrapper });

    // Act
    result.current.mutate({ productIds: ['p1', 'p2', 'p3'], familyId: 'fam-9' });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdate).toHaveBeenCalledTimes(3);
    expect(mockUpdate).toHaveBeenCalledWith('p1', { familyId: 'fam-9' });
    expect(mockUpdate).toHaveBeenCalledWith('p2', { familyId: 'fam-9' });
    expect(mockUpdate).toHaveBeenCalledWith('p3', { familyId: 'fam-9' });
    expect(result.current.data).toEqual({ ok: 3, failed: 0, failedIds: [] });
  });

  it('en éxito total invalida las queries ["products"] y ["families"]', async () => {
    // Arrange
    mockUpdate.mockResolvedValue({} as never);
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useAssignProductsToFamily(), { wrapper });

    // Act
    result.current.mutate({ productIds: ['p1'], familyId: 'fam-1' });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['products'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['families'] });
  });

  it('con fallo parcial (allSettled) reporta ok/failed/failedIds sin abortar el lote', async () => {
    // Arrange: p2 rechaza; p1 y p3 resuelven.
    mockUpdate.mockImplementation((id: string) =>
      id === 'p2' ? Promise.reject(new Error('boom')) : Promise.resolve({} as never),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAssignProductsToFamily(), { wrapper });

    // Act
    result.current.mutate({ productIds: ['p1', 'p2', 'p3'], familyId: 'fam-2' });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdate).toHaveBeenCalledTimes(3);
    expect(result.current.data).toEqual({ ok: 2, failed: 1, failedIds: ['p2'] });
  });

  it('aun con fallo parcial invalida las queries (los éxitos deben reflejarse)', async () => {
    // Arrange
    mockUpdate.mockImplementation((id: string) =>
      id === 'p1' ? Promise.reject(new Error('boom')) : Promise.resolve({} as never),
    );
    const { wrapper, qc } = makeWrapper();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useAssignProductsToFamily(), { wrapper });

    // Act
    result.current.mutate({ productIds: ['p1', 'p2'], familyId: 'fam-3' });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['products'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['families'] });
    expect(result.current.data).toEqual({ ok: 1, failed: 1, failedIds: ['p1'] });
  });
});

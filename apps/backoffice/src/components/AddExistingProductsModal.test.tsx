import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/products.js', () => ({
  listProducts: vi.fn(),
  updateProduct: vi.fn(),
}));

import type { FamilyNode } from '../lib/families.js';
import { listProducts, type Product, updateProduct } from '../lib/products.js';
import { AddExistingProductsModal } from './AddExistingProductsModal.js';

const mockList = vi.mocked(listProducts);
const mockUpdate = vi.mocked(updateProduct);

// Árbol: destino "Aceites" (fam-target) y otra familia "Cremas" (fam-other).
const families: FamilyNode[] = [
  {
    id: 'fam-target',
    name: 'Aceites',
    parentId: null,
    sortOrder: 0,
    isArchetype: false,
    color: null,
    icon: null,
    children: [],
  },
  {
    id: 'fam-other',
    name: 'Cremas',
    parentId: null,
    sortOrder: 1,
    isArchetype: false,
    color: null,
    icon: null,
    children: [],
  },
];

function product(over: Partial<Product>): Product {
  return {
    id: 'p',
    name: 'Producto',
    sku: null,
    barcode: null,
    description: null,
    salePrice: '10',
    costPrice: '5',
    taxRate: '21',
    saleUnit: 'unit',
    unitSymbol: 'u',
    familyId: null,
    active: true,
    ...over,
  };
}

// p1: huérfano (sin familia) — seleccionable, sin badge.
// p2: en otra familia (Cremas) — seleccionable, badge "Ya en Cremas".
// p3: YA en el nodo destino (Aceites) — deshabilitado, badge "Ya en Aceites".
const PRODUCTS: Product[] = [
  product({ id: 'p1', name: 'Aceite huérfano', familyId: null }),
  product({ id: 'p2', name: 'Crema ajena', familyId: 'fam-other' }),
  product({ id: 'p3', name: 'Aceite del nodo', familyId: 'fam-target' }),
];

function renderModal(onClose = vi.fn(), onAdded = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AddExistingProductsModal
        targetFamilyId="fam-target"
        targetFamilyName="Aceites"
        families={families}
        onClose={onClose}
        onAdded={onAdded}
      />
    </QueryClientProvider>,
  );
  return { onClose, onAdded, qc };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AddExistingProductsModal (S-18)', () => {
  it('lista los productos y muestra el badge "Ya en {familia}" en el del nodo destino y el de otra familia', async () => {
    mockList.mockResolvedValue(PRODUCTS);
    renderModal();

    expect(await screen.findByTestId('fam-add-existing-modal')).toBeInTheDocument();
    const items = await screen.findAllByTestId('fam-add-existing-item');
    expect(items).toHaveLength(3);

    // El que YA está en el nodo destino: badge "Ya en Aceites".
    expect(screen.getByTestId('fam-add-existing-here')).toHaveTextContent('Ya en Aceites');
    // El de otra familia: badge "Ya en Cremas".
    expect(screen.getByTestId('fam-add-existing-other')).toHaveTextContent('Ya en Cremas');
  });

  it('excluye de la selección (checkbox deshabilitado) el producto que ya está en el nodo destino', async () => {
    mockList.mockResolvedValue(PRODUCTS);
    renderModal();

    const checks = (await screen.findAllByTestId('fam-add-existing-check')) as HTMLInputElement[];
    // p1 y p2 habilitados; p3 (ya en el nodo) deshabilitado.
    expect(checks[0]).not.toBeDisabled();
    expect(checks[1]).not.toBeDisabled();
    expect(checks[2]).toBeDisabled();
  });

  it('permite multi-selección y al confirmar llama al hook con los ids seleccionados', async () => {
    mockList.mockResolvedValue(PRODUCTS);
    mockUpdate.mockResolvedValue({} as never);
    const { onClose, onAdded } = renderModal();

    const checks = (await screen.findAllByTestId('fam-add-existing-check')) as HTMLInputElement[];
    // Selecciona el huérfano y el de otra familia (los dos seleccionables).
    fireEvent.click(checks[0]!);
    fireEvent.click(checks[1]!);

    const confirm = screen.getByTestId('fam-add-existing-confirm');
    expect(confirm).toHaveTextContent('Añadir 2');
    fireEvent.click(confirm);

    // El hook hace un updateProduct por producto seleccionado, con el familyId destino.
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockUpdate).toHaveBeenCalledWith('p1', { familyId: 'fam-target' });
    expect(mockUpdate).toHaveBeenCalledWith('p2', { familyId: 'fam-target' });
    // Éxito total: dispara onAdded y cierra.
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('confirmar está deshabilitado mientras no haya selección', async () => {
    mockList.mockResolvedValue(PRODUCTS);
    renderModal();

    await screen.findByTestId('fam-add-existing-modal');
    expect(screen.getByTestId('fam-add-existing-confirm')).toBeDisabled();
  });

  it('en error parcial mantiene el modal abierto y muestra el aviso inline', async () => {
    mockList.mockResolvedValue(PRODUCTS);
    // p2 falla, p1 entra.
    mockUpdate.mockImplementation((id: string) =>
      id === 'p2' ? Promise.reject(new Error('boom')) : Promise.resolve({} as never),
    );
    const { onClose, onAdded } = renderModal();

    const checks = (await screen.findAllByTestId('fam-add-existing-check')) as HTMLInputElement[];
    fireEvent.click(checks[0]!);
    fireEvent.click(checks[1]!);
    fireEvent.click(screen.getByTestId('fam-add-existing-confirm'));

    // Aviso de fallo parcial visible; el modal NO se cierra (algún PATCH falló).
    const err = await screen.findByTestId('fam-add-existing-error');
    expect(err).toHaveTextContent('1 producto(s) no se pudieron añadir');
    expect(onAdded).toHaveBeenCalled(); // el éxito (p1) sí refresca
    expect(onClose).not.toHaveBeenCalled();
  });

  it('escribir en el buscador re-consulta listProducts con el término', async () => {
    mockList.mockResolvedValue(PRODUCTS);
    renderModal();

    await screen.findByTestId('fam-add-existing-modal');
    fireEvent.change(screen.getByTestId('fam-add-existing-search'), {
      target: { value: 'aceite' },
    });

    await waitFor(() => expect(mockList).toHaveBeenCalledWith('aceite'));
  });

  it('no muestra badge en el producto huérfano (sin familia)', async () => {
    mockList.mockResolvedValue(PRODUCTS);
    renderModal();

    const items = await screen.findAllByTestId('fam-add-existing-item');
    const orphanRow = items.find((el) => el.getAttribute('data-product-id') === 'p1')!;
    expect(within(orphanRow).queryByTestId('fam-add-existing-other')).not.toBeInTheDocument();
    expect(within(orphanRow).queryByTestId('fam-add-existing-here')).not.toBeInTheDocument();
  });
});

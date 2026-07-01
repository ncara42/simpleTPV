import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Libs de datos mockeadas para renderizar sin red. Smoke test del orquestador
// Proveedores (P1-B): cuatro pestañas + cambio de sección.
vi.mock('./lib/purchases.js', () => ({
  listSuppliers: vi.fn(() => Promise.resolve([])),
  listPurchaseOrders: vi.fn(() => Promise.resolve([])),
  getPurchaseOrder: vi.fn(() => Promise.resolve(null)),
  suggestPurchase: vi.fn(() => Promise.resolve([])),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  deleteSupplier: vi.fn(),
  confirmPurchaseOrder: vi.fn(),
  createPurchaseOrder: vi.fn(),
  receivePurchaseOrder: vi.fn(),
}));
vi.mock('./lib/admin.js', () => ({ listStores: vi.fn(() => Promise.resolve([])) }));
vi.mock('./lib/families.js', () => ({ listFamilies: vi.fn(() => Promise.resolve([])) }));
vi.mock('./lib/products.js', () => ({ listProducts: vi.fn(() => Promise.resolve([])) }));
vi.mock('./lib/supplier-prices.js', () => ({
  listSupplierPrices: vi.fn(() => Promise.resolve([])),
  compareSupplierPrices: vi.fn(() => Promise.resolve([])),
  upsertSupplierPrice: vi.fn(),
  deleteSupplierPrice: vi.fn(),
  importSupplierPricesCsv: vi.fn(),
}));

import { listStores } from './lib/admin.js';
import { PageNavProvider, usePageNavValue } from './lib/pageNav.js';
import { listSuppliers, suggestPurchase } from './lib/purchases.js';
import { compareSupplierPrices } from './lib/supplier-prices.js';
import { SuppliersPage } from './SuppliersPage.js';

// Las subpestañas se inyectan en la TopBar vía usePageNav; este outlet las pinta en el DOM de test.
function PageNavOutlet(): ReactNode {
  return <>{usePageNavValue()}</>;
}

type RenderOpts = {
  initialSection?: 'suppliers' | 'prices' | 'orders' | 'suggest' | null;
  initialPricesView?: 'tarifas' | 'comparativa' | null;
  /** Siembra el caché de preferencias para verificar que la comparativa las IGNORA. */
  prefs?: Record<string, unknown>;
};

function renderPage(opts: RenderOpts = {}): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (opts.prefs) qc.setQueryData(['preferences'], opts.prefs);
  render(
    <QueryClientProvider client={qc}>
      <PageNavProvider>
        <PageNavOutlet />
        <SuppliersPage
          initialSection={opts.initialSection ?? null}
          initialPricesView={opts.initialPricesView ?? null}
        />
      </PageNavProvider>
    </QueryClientProvider>,
  );
}

describe('SuppliersPage', () => {
  it('renderiza las cuatro pestañas', () => {
    renderPage();
    expect(screen.getByTestId('suppliers-page')).toBeInTheDocument();
    expect(screen.getByTestId('suppliers-tab-suppliers')).toBeInTheDocument();
    expect(screen.getByTestId('suppliers-tab-prices')).toBeInTheDocument();
    expect(screen.getByTestId('suppliers-tab-orders')).toBeInTheDocument();
    expect(screen.getByTestId('suppliers-tab-suggest')).toBeInTheDocument();
  });

  it('muestra Proveedores por defecto (vacío sin datos)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('suppliers-empty')).toBeInTheDocument());
  });

  it('clic en un proveedor despliega su detalle EN LÍNEA; «Editar» abre la vista completa (I-18)', async () => {
    vi.mocked(listSuppliers).mockResolvedValue([
      {
        id: 'sup1',
        name: 'Distribuciones Norte',
        nif: null,
        email: null,
        phone: null,
        leadTimeDays: 5,
        orderFrequencyDays: null,
        active: true,
      },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId('supplier-row')).toHaveLength(1));
    // Clic en la fila → acordeón EN LÍNEA (rediseño tipo Traspasos); aún NO navega a
    // la vista completa.
    fireEvent.click(screen.getAllByTestId('supplier-row')[0]!);
    expect(screen.getByTestId('supplier-detail-inline')).toBeInTheDocument();
    expect(screen.queryByTestId('supplier-detail')).not.toBeInTheDocument();
    // «Editar proveedor» abre la vista completa: datos editables + tarifa + pedidos.
    fireEvent.click(screen.getByTestId('supplier-edit'));
    expect(screen.getByTestId('supplier-detail')).toBeInTheDocument();
    expect(screen.getByTestId('sd-name')).toHaveValue('Distribuciones Norte');
    await waitFor(() => expect(screen.getByTestId('sp-empty')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('orders-empty')).toBeInTheDocument());
    expect(screen.getByTestId('orders-empty')).toHaveTextContent('Este proveedor no tiene');
    // El detalle fija el proveedor: no hay selector ni pestaña de comparativa.
    expect(screen.queryByTestId('sp-supplier')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sp-view-tabs')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('supplier-back'));
    expect(screen.queryByTestId('supplier-detail')).not.toBeInTheDocument();
    vi.mocked(listSuppliers).mockResolvedValue([]);
  });

  it('cambia a Tarifas de compra y a Propuesta al pulsar las pestañas', async () => {
    renderPage();

    fireEvent.click(screen.getByTestId('suppliers-tab-prices'));
    await waitFor(() => expect(screen.getByTestId('sp-empty')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('suppliers-tab-suggest'));
    await waitFor(() => expect(screen.getByTestId('suggest-empty')).toBeInTheDocument());
  });

  // ── S-25: deep-link a la comparativa + barras forzadas ──────────────────────
  it('S-25: con initialSection="prices" + initialPricesView="comparativa" arranca en la comparativa', async () => {
    renderPage({ initialSection: 'prices', initialPricesView: 'comparativa' });
    // Monta directamente la sección Tarifas en su sub-vista Comparativa (1 clic).
    await waitFor(() => expect(screen.getByTestId('sp-view-tabs')).toBeInTheDocument());
    const cmpTab = screen.getByTestId('sp-view-comparativa');
    expect(cmpTab).toHaveClass('active');
    expect(screen.getByTestId('sp-view-tarifas')).not.toHaveClass('active');
    // Los dos paneles de la comparativa son visibles.
    expect(screen.getByTestId('sp-cmp-avg')).toBeInTheDocument();
    expect(screen.getByTestId('sp-cmp-product')).toBeInTheDocument();
  });

  it('S-25/DR-06: los gráficos de la comparativa SIEMPRE van en barras, aunque la pref global sea "line"', async () => {
    vi.mocked(compareSupplierPrices).mockResolvedValue([
      {
        productId: 'p1',
        productName: 'Aceite CBD 10%',
        sku: 'CBD-10',
        prices: [
          { supplierId: 's1', supplierName: 'Norte', price: 10 },
          { supplierId: 's2', supplierName: 'Sur', price: 12 },
        ],
        best: { supplierId: 's1', supplierName: 'Norte', price: 10 },
      },
    ]);
    // Preferencia global de gráfico en LÍNEA: la comparativa debe ignorarla.
    renderPage({
      initialSection: 'prices',
      initialPricesView: 'comparativa',
      prefs: { 'dashboard.layout': { chartKind: 'line' } },
    });
    // El gráfico de media/mediana por proveedor renderiza en barras (ui-chart-bars),
    // no en línea (ui-chart-line), pese a la preferencia global 'line'.
    const avgChart = await waitFor(() => {
      const chart = screen.getByTestId('sp-cmp-avg').querySelector('.ui-chart');
      expect(chart).not.toBeNull();
      return chart as HTMLElement;
    });
    expect(avgChart).toHaveClass('ui-chart-bars');
    expect(avgChart).not.toHaveClass('ui-chart-line');
    vi.mocked(compareSupplierPrices).mockResolvedValue([]);
  });

  // ── Propuesta: periodicidad elegible + coste estimado ───────────────────────
  it('la propuesta envía la periodicidad elegida y muestra tránsito, coste y total estimado', async () => {
    vi.mocked(listStores).mockResolvedValue([{ id: 'st1', name: 'Central' }] as never);
    vi.mocked(suggestPurchase).mockResolvedValue([
      {
        productId: 'p1',
        productName: 'Aceite CBD 10%',
        stockActual: 5,
        minStock: 20,
        ventaMedia30d: 60,
        ventaMediaDiaria: 2,
        rotacion: 0.4,
        coberturaDias: 2.5,
        pendienteRecibir: 6,
        horizonteDias: 10,
        precioUnitario: 2.5,
        costeEstimado: 87.5,
        cantidadSugerida: 35,
      },
    ]);
    renderPage({ initialSection: 'suggest' });

    // Tienda y periodicidad semanal desde las facetas de botones del carril (sin
    // desplegables: mismo carril que Proveedores).
    fireEvent.click(await screen.findByTestId('suggest-store-st1'));
    fireEvent.click(screen.getByTestId('suggest-coverage-7'));
    fireEvent.click(screen.getByTestId('suggest-generate'));

    await waitFor(() => expect(screen.getAllByTestId('suggest-row')).toHaveLength(1));
    // La periodicidad viaja como daysCoverage; sin proveedor no se envía supplierId.
    expect(suggestPurchase).toHaveBeenCalledWith(
      { storeId: 'st1', daysCoverage: 7 },
      expect.anything(),
    );
    // Horizonte usado por el cálculo + unidades en tránsito + total estimado.
    expect(screen.getByTestId('suggest-horizon')).toHaveTextContent('Horizonte de demanda: 10 d');
    expect(screen.getByTestId('suggest-pending')).toHaveTextContent('6');
    expect(screen.getByTestId('suggest-total')).toHaveTextContent('87,50');

    // Carril de filtros (igual que Proveedores): la faceta «En tránsito» sí conserva
    // la fila (tiene pendiente), «Con tarifa» también; una búsqueda que no casa la oculta.
    expect(screen.getByTestId('suggest-facets')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('suggest-estado-transit'));
    expect(screen.getAllByTestId('suggest-row')).toHaveLength(1);
    fireEvent.change(screen.getByTestId('suggest-search'), { target: { value: 'zzz' } });
    expect(screen.queryByTestId('suggest-row')).not.toBeInTheDocument();
    expect(screen.getByTestId('suggest-empty')).toHaveTextContent('Ningún producto coincide');

    vi.mocked(listStores).mockResolvedValue([]);
    vi.mocked(suggestPurchase).mockResolvedValue([]);
  });
});

import './suppliers.css';

import { Button, type FacetedColumn, FacetedTable, Input } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { listStores } from '../lib/admin.js';
import { fmtEur } from '../lib/format.js';
import {
  createPurchaseOrder,
  listSuppliers,
  type SuggestionRow,
  suggestPurchase,
} from '../lib/purchases.js';
import { useTableShellHeight } from '../lib/useTableShellHeight.js';

// Cobertura de la propuesta como facetas (sin desplegables): '' = automática
// (periodicidad de compra del proveedor o el default del backend), preset en días
// o personalizada.
const COVERAGE_AUTO = '';
const COVERAGE_CUSTOM = 'custom';
const COVERAGE_VIEWS: { value: string; label: string; testKey: string }[] = [
  { value: COVERAGE_AUTO, label: 'Automática', testKey: 'auto' },
  { value: '7', label: 'Semanal · 7 días', testKey: '7' },
  { value: '14', label: 'Quincenal · 14 días', testKey: '14' },
  { value: '30', label: 'Mensual · 30 días', testKey: '30' },
  { value: COVERAGE_CUSTOM, label: 'Personalizada', testKey: 'custom' },
];

// Filtro de estado del carril (vista de la propuesta ya generada).
type EstadoKey = '' | 'low' | 'transit' | 'priced';

export function SuggestSection() {
  const qc = useQueryClient();
  const shellHeight = useTableShellHeight();
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: listSuppliers });
  const [storeId, setStoreId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [coverage, setCoverage] = useState<string>(COVERAGE_AUTO);
  const [customDays, setCustomDays] = useState('10');
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  // Filtros del carril sobre la propuesta ya generada.
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<EstadoKey>('');
  // Grupo plegable (misma mecánica que Proveedores/Inventario/Usuarios).
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleGroup = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Días de cobertura a enviar; undefined = que decida el backend (periodicidad
  // del proveedor o default).
  const coverageDays = (() => {
    if (coverage === COVERAGE_AUTO) return undefined;
    const days = Number(coverage === COVERAGE_CUSTOM ? customDays : coverage);
    return Number.isFinite(days) && days > 0 ? days : undefined;
  })();

  const suggestMut = useMutation({
    mutationFn: suggestPurchase,
    onSuccess: (data) => {
      setRows(data);
      setQty(Object.fromEntries(data.map((r) => [r.productId, String(r.cantidadSugerida)])));
      // La propuesta nueva reinicia los filtros del carril.
      setSearch('');
      setEstado('');
    },
  });
  const createMut = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: () => {
      setRows([]);
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  // Predicados de las facetas de Estado (bajo mínimo · en tránsito · con tarifa).
  const isLow = (r: SuggestionRow): boolean => r.stockActual < r.minStock;
  const inTransit = (r: SuggestionRow): boolean => r.pendienteRecibir > 0;
  const isPriced = (r: SuggestionRow): boolean => r.precioUnitario != null;

  // Filas visibles tras búsqueda por nombre + faceta de estado (el filtro es solo
  // de vista: el pedido se crea sobre toda la propuesta).
  const shownRows = rows.filter((r) => {
    if (search && !r.productName.toLowerCase().includes(search.toLowerCase())) return false;
    if (estado === 'low' && !isLow(r)) return false;
    if (estado === 'transit' && !inTransit(r)) return false;
    if (estado === 'priced' && !isPriced(r)) return false;
    return true;
  });

  // Unidades y coste del PEDIDO COMPLETO (todas las líneas con cantidad > 0),
  // independientes del filtro de vista.
  const unitsOf = (r: SuggestionRow): number => {
    const n = Number(qty[r.productId] ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const totalUnits = rows.reduce((acc, r) => acc + unitsOf(r), 0);
  const shownUnits = shownRows.reduce((acc, r) => acc + unitsOf(r), 0);
  const estimatedTotal = rows.reduce<number | null>((acc, r) => {
    const units = unitsOf(r);
    if (r.precioUnitario == null || units <= 0) return acc;
    return (acc ?? 0) + units * r.precioUnitario;
  }, null);

  const storeName = stores.find((s) => s.id === storeId)?.name;

  const columns: FacetedColumn<SuggestionRow>[] = [
    { key: 'product', header: 'Producto', variant: 'name', render: (r) => r.productName },
    { key: 'stock', header: 'Stock', variant: 'num', render: (r) => r.stockActual },
    { key: 'min', header: 'Mín', variant: 'num', render: (r) => r.minStock },
    {
      key: 'avg',
      header: 'Venta media/día',
      variant: 'num',
      render: (r) => r.ventaMediaDiaria,
    },
    {
      key: 'coverage',
      header: 'Cobertura',
      variant: 'num',
      render: (r) => (r.coberturaDias != null ? `${r.coberturaDias} d` : '—'),
    },
    {
      key: 'pending',
      header: 'En tránsito',
      variant: 'num',
      render: (r) => (
        <span data-testid="suggest-pending">
          {r.pendienteRecibir > 0 ? r.pendienteRecibir : '—'}
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'Coste/ud',
      variant: 'num',
      render: (r) => (r.precioUnitario != null ? fmtEur(r.precioUnitario) : '—'),
    },
    {
      key: 'order',
      header: 'Pedir',
      variant: 'num',
      render: (r) => (
        <Input
          type="number"
          min={0}
          value={qty[r.productId] ?? ''}
          onChange={(e) => setQty({ ...qty, [r.productId]: e.target.value })}
          data-testid="suggest-qty"
          style={{ width: '5rem' }}
        />
      ),
    },
  ];

  // Una sola cabecera de grupo (label · nº productos · uds. a pedir), mismo
  // lenguaje visual que los grupos de Proveedores/Inventario.
  const groups =
    shownRows.length > 0
      ? [
          {
            key: 'suggest',
            label: storeName ?? 'Reposición sugerida',
            meta: `${shownRows.length} ${shownRows.length === 1 ? 'producto' : 'productos'}`,
            metaRight: `${shownUnits} uds.`,
            rows: shownRows,
          },
        ]
      : [];

  // Opciones de la faceta Estado con sus recuentos (sobre toda la propuesta).
  const estadoViews: { key: EstadoKey; label: string; count: number }[] = [
    { key: '', label: 'Todos', count: rows.length },
    { key: 'low', label: 'Bajo mínimo', count: rows.filter(isLow).length },
    { key: 'transit', label: 'En tránsito', count: rows.filter(inTransit).length },
    { key: 'priced', label: 'Con tarifa', count: rows.filter(isPriced).length },
  ];

  return (
    <div
      className="suppliers-shell"
      data-testid="suggest-section"
      style={shellHeight != null ? { height: shellHeight } : undefined}
    >
      <div className="sup-card">
        <div className="sup-body">
          <aside className="sup-rail" aria-label="Propuesta de compra" data-testid="suggest-facets">
            <section className="sup-facet">
              <h3 className="sup-facet-title">Tienda</h3>
              {stores.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`sup-view${storeId === s.id ? ' is-active' : ''}`}
                  aria-pressed={storeId === s.id}
                  onClick={() => setStoreId(s.id)}
                  data-testid={`suggest-store-${s.id}`}
                >
                  <span className="sup-view-label">{s.name}</span>
                </button>
              ))}
            </section>

            <section className="sup-facet">
              <h3 className="sup-facet-title">Proveedor</h3>
              <button
                type="button"
                className={`sup-view${supplierId === '' ? ' is-active' : ''}`}
                aria-pressed={supplierId === ''}
                onClick={() => setSupplierId('')}
                data-testid="suggest-supplier-all"
              >
                <span className="sup-view-label">Todos</span>
              </button>
              {suppliers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`sup-view${supplierId === s.id ? ' is-active' : ''}`}
                  aria-pressed={supplierId === s.id}
                  onClick={() => setSupplierId(s.id)}
                  data-testid={`suggest-supplier-${s.id}`}
                >
                  <span className="sup-view-label">{s.name}</span>
                </button>
              ))}
            </section>

            <section className="sup-facet">
              <h3 className="sup-facet-title">Periodicidad</h3>
              {COVERAGE_VIEWS.map((v) => (
                <button
                  key={v.testKey}
                  type="button"
                  className={`sup-view${coverage === v.value ? ' is-active' : ''}`}
                  aria-pressed={coverage === v.value}
                  onClick={() => setCoverage(v.value)}
                  data-testid={`suggest-coverage-${v.testKey}`}
                >
                  <span className="sup-view-label">{v.label}</span>
                </button>
              ))}
              {coverage === COVERAGE_CUSTOM && (
                <input
                  type="number"
                  min={1}
                  max={365}
                  className="sup-rail-input suggest-custom-days"
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                  aria-label="Días de cobertura"
                  placeholder="Días de cobertura"
                  data-testid="suggest-coverage-days"
                />
              )}
            </section>

            <Button
              type="button"
              className="suggest-rail-btn"
              disabled={!storeId || suggestMut.isPending}
              onClick={() =>
                suggestMut.mutate({
                  storeId,
                  ...(supplierId ? { supplierId } : {}),
                  ...(coverageDays != null ? { daysCoverage: coverageDays } : {}),
                })
              }
              data-testid="suggest-generate"
              icon={<Sparkles size={16} aria-hidden="true" />}
            >
              Generar propuesta
            </Button>

            {rows.length > 0 && (
              <>
                <span className="sup-rail-search suggest-rail-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    className="sup-rail-input"
                    placeholder="Buscar producto…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    data-testid="suggest-search"
                  />
                </span>

                <section className="sup-facet">
                  <h3 className="sup-facet-title">Estado</h3>
                  {estadoViews.map((v) => (
                    <button
                      key={v.key || 'all'}
                      type="button"
                      className={`sup-view${estado === v.key ? ' is-active' : ''}`}
                      aria-pressed={estado === v.key}
                      onClick={() => setEstado(v.key)}
                      data-testid={`suggest-estado-${v.key || 'all'}`}
                    >
                      <span className="sup-view-label">{v.label}</span>
                      <span className="sup-view-count">{v.count}</span>
                    </button>
                  ))}
                </section>

                <div className="suggest-order">
                  {rows[0] != null && (
                    <span className="suggest-horizon" data-testid="suggest-horizon">
                      Horizonte de demanda: {rows[0].horizonteDias} d
                    </span>
                  )}
                  <span className="suggest-total" data-testid="suggest-total">
                    {estimatedTotal != null
                      ? `Total estimado: ${fmtEur(estimatedTotal)}`
                      : `${totalUnits} uds. a pedir`}
                  </span>
                  <Button
                    type="button"
                    className="suggest-rail-btn"
                    disabled={!supplierId || createMut.isPending}
                    onClick={() =>
                      createMut.mutate({
                        supplierId,
                        storeId,
                        lines: rows
                          .filter((r) => Number(qty[r.productId] ?? 0) > 0)
                          .map((r) => ({
                            productId: r.productId,
                            quantityOrdered: Number(qty[r.productId]),
                            // La tarifa del proveedor viaja al pedido: coste real de compra.
                            ...(r.precioUnitario != null ? { unitCost: r.precioUnitario } : {}),
                          })),
                      })
                    }
                    data-testid="suggest-create-order"
                  >
                    Crear pedido
                  </Button>
                  {!supplierId && (
                    <span className="suggest-order-hint">Selecciona un proveedor para pedir.</span>
                  )}
                </div>
              </>
            )}
          </aside>

          <div className="sup-main" data-testid="suggest-table">
            <FacetedTable<SuggestionRow>
              layout="table"
              columns={columns}
              groups={groups}
              rowKey={(r) => r.productId}
              rowTestId="suggest-row"
              loading={suggestMut.isPending && rows.length === 0}
              collapsedKeys={collapsed}
              onToggleGroup={toggleGroup}
              emptyState={
                <span className="catalog-empty" data-testid="suggest-empty">
                  {!suggestMut.isSuccess
                    ? 'Elige una tienda y genera una propuesta.'
                    : rows.length === 0
                      ? 'No hay nada que reponer.'
                      : 'Ningún producto coincide con los filtros.'}
                </span>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

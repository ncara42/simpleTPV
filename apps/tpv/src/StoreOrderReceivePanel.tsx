import { ApiError, type StoreOrder } from '@simpletpv/auth';
import { Alert, Button, Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, PackageCheck, X } from 'lucide-react';
import { useState } from 'react';

import { usePageHeader } from './lib/pageHeader.js';
import { listStores } from './lib/sales.js';
import { listIncomingStoreOrders, receiveStoreOrder } from './lib/store-orders.js';

interface LineInput {
  received: string;
  note: string;
}

export function StoreOrderReceivePanel() {
  usePageHeader('Pedidos', 'Mercancía enviada desde central');
  const qc = useQueryClient();
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const activeStore = stores[0]?.id ?? null;

  const [selected, setSelected] = useState<StoreOrder | null>(null);
  const [lines, setLines] = useState<Record<string, LineInput>>({});
  const [done, setDone] = useState(false);
  const [scan, setScan] = useState('');
  // Cabecera del panel (buscador + filtro de estado), como las tablas del admin.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['incoming-store-orders', activeStore],
    queryFn: () => listIncomingStoreOrders(activeStore as string),
    enabled: activeStore !== null,
  });

  const receiveMutation = useMutation({
    mutationFn: (t: StoreOrder) =>
      receiveStoreOrder(t.id, {
        lines: t.lines.map((l) => ({
          lineId: l.id,
          quantityReceived: Number(lines[l.id]?.received ?? l.quantitySent),
          ...(lines[l.id]?.note ? { discrepancyNote: lines[l.id]!.note } : {}),
        })),
      }),
    onSuccess: () => {
      setDone(true);
      setSelected(null);
      void qc.invalidateQueries({ queryKey: ['incoming-store-orders', activeStore] });
      void qc.invalidateQueries({ queryKey: ['store-stock', activeStore] });
    },
  });

  function openOrder(t: StoreOrder) {
    setDone(false);
    setSelected(t);
    const init: Record<string, LineInput> = {};
    for (const l of t.lines) {
      init[l.id] = { received: String(l.quantitySent), note: '' };
    }
    setLines(init);
  }

  function bumpScannedLine() {
    const term = scan.trim().toLowerCase();
    if (!selected || term.length === 0) return;
    const line = selected.lines.find(
      (l) =>
        l.productId.toLowerCase() === term ||
        l.barcode?.toLowerCase() === term ||
        l.productName?.toLowerCase().includes(term),
    );
    if (!line) return;
    setLines((prev) => ({
      ...prev,
      [line.id]: {
        received: String(Number(prev[line.id]?.received ?? 0) + 1),
        note: prev[line.id]?.note ?? '',
      },
    }));
    setScan('');
  }

  // Formatea createdAt/sentAt como "31/05 08:30". Usa la hora UTC para mostrar
  // las marcas demo tal cual (sin desfase por la zona local del navegador).
  function fmt(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const min = String(d.getUTCMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${min}`;
  }

  // Filtro de la cabecera: por texto (origen/fecha/nº líneas) y por estado.
  const term = search.trim().toLowerCase();
  const visibleOrders = orders.filter((t) => {
    if (statusFilter !== '' && t.status !== statusFilter) return false;
    if (term === '') return true;
    const haystack = `central ${fmt(t.sentAt ?? t.createdAt)} ${t.lines.length}`.toLowerCase();
    return haystack.includes(term);
  });

  return (
    <>
      <div className="transfer-view" data-testid="store-order-receive">
        <div className="table-panel">
          <div className="users-toolbar">
            <div className="sales-filters">
              <span className="search-field">
                <input
                  className="catalog-search"
                  placeholder="Buscar por origen o fecha…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="store-order-search"
                />
              </span>
              <Select
                className="catalog-search"
                value={statusFilter}
                onChange={setStatusFilter}
                ariaLabel="Filtrar por estado"
                data-testid="store-order-status-filter"
                options={[
                  { value: '', label: 'Todos los estados' },
                  { value: 'SENT', label: 'Pendientes' },
                  { value: 'RECEIVED', label: 'Recibidos' },
                ]}
              />
            </div>
          </div>
          {isLoading ? (
            <p className="catalog-empty">Cargando…</p>
          ) : orders.length === 0 ? (
            <p className="catalog-empty" data-testid="store-order-empty">
              No hay pedidos pendientes de recibir.
            </p>
          ) : visibleOrders.length === 0 ? (
            <p className="catalog-empty" data-testid="store-order-no-results">
              Sin pedidos que coincidan con el filtro.
            </p>
          ) : (
            <table className="catalog-table" data-testid="store-order-list">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Origen</th>
                  <th>Líneas</th>
                  <th>Estado</th>
                  <th aria-label="Acción" />
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((t) => {
                  const received = t.status === 'RECEIVED';
                  return (
                    <tr key={t.id} data-testid="store-order-item">
                      <td className="muted">{fmt(t.sentAt ?? t.createdAt)}</td>
                      <td>Central</td>
                      <td>{t.lines.length}</td>
                      <td>
                        <span
                          className={`order-state ${received ? 'received' : 'pending'}`}
                          data-testid="store-order-status"
                        >
                          <span className="order-state__icon">
                            {received ? (
                              <Check size={13} strokeWidth={3} aria-hidden="true" />
                            ) : (
                              <Clock size={13} strokeWidth={2.5} aria-hidden="true" />
                            )}
                          </span>
                          {received ? 'Recibido' : 'Pendiente'}
                        </span>
                      </td>
                      <td className="catalog-table__action">
                        {!received && (
                          <button
                            type="button"
                            className="link-btn link-btn--receive"
                            onClick={() => openOrder(t)}
                            data-testid="store-order-open"
                          >
                            <PackageCheck size={15} strokeWidth={2.25} aria-hidden="true" />
                            Recibir
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected && (
        <div
          className="pay-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recv-modal-title"
          data-testid="store-order-receive-detail"
          onClick={() => setSelected(null)}
        >
          <div className="pay-modal recv-modal" onClick={(e) => e.stopPropagation()}>
            <header className="recv-modal__head">
              <h2 id="recv-modal-title" className="recv-modal__title">
                Recepción de pedido
              </h2>
              <button
                type="button"
                className="recv-modal__close"
                onClick={() => setSelected(null)}
                aria-label="Cerrar"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            <div className="recv-modal__body">
              <div className="sale-search-wrap">
                <input
                  className="sale-search"
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && bumpScannedLine()}
                  placeholder="Escanea o busca producto recibido..."
                  data-testid="store-order-scan"
                  autoFocus
                />
                <button type="button" className="scan-btn" onClick={bumpScannedLine}>
                  Añadir
                </button>
              </div>

              <div className="recv-table-wrap">
                <table className="recv-table" data-testid="store-order-lines">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="recv-table__num">Enviado</th>
                      <th className="recv-table__num">Recibido</th>
                      <th>Nota discrepancia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lines.map((l) => (
                      <tr key={l.id} data-testid="store-order-line">
                        <td className="recv-table__name">
                          {l.productName ?? `${l.productId.slice(0, 8)}...`}
                        </td>
                        <td className="recv-table__num recv-table__sent">{l.quantitySent}</td>
                        <td className="recv-table__num">
                          <input
                            type="number"
                            min={0}
                            value={lines[l.id]?.received ?? ''}
                            onChange={(e) =>
                              setLines((prev) => ({
                                ...prev,
                                [l.id]: { received: e.target.value, note: prev[l.id]?.note ?? '' },
                              }))
                            }
                            data-testid="store-order-received-input"
                            className="recv-input recv-input--num"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            placeholder="(opcional)"
                            value={lines[l.id]?.note ?? ''}
                            onChange={(e) =>
                              setLines((prev) => ({
                                ...prev,
                                [l.id]: {
                                  received: prev[l.id]?.received ?? '',
                                  note: e.target.value,
                                },
                              }))
                            }
                            data-testid="store-order-note-input"
                            className="recv-input"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {receiveMutation.isError && (
                <p className="recv-error" data-testid="transfer-error">
                  {receiveMutation.error instanceof ApiError
                    ? receiveMutation.error.message
                    : 'No se pudo recibir el pedido.'}
                </p>
              )}
            </div>

            <footer className="modal-foot">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelected(null)}
                data-testid="store-order-cancel"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={receiveMutation.isPending}
                onClick={() => receiveMutation.mutate(selected)}
                data-testid="store-order-confirm"
              >
                {receiveMutation.isPending ? 'Confirmando…' : 'Confirmar recepción'}
              </Button>
            </footer>
          </div>
        </div>
      )}

      {done && (
        <Alert
          variant="success"
          data-testid="store-order-received"
          onClose={() => setDone(false)}
          closeLabel="Cerrar aviso"
          closeTestId="store-order-back"
          icon={<Check size={14} strokeWidth={3} aria-hidden="true" />}
        >
          <strong>Pedido recibido</strong>
          <span>El stock se ha actualizado correctamente.</span>
        </Alert>
      )}
    </>
  );
}

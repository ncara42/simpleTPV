import { ApiError, type StoreOrder } from '@simpletpv/auth';
import {
  Alert,
  Button,
  DataTable,
  type FacetedColumn,
  type FacetedGroup,
  FacetedTable,
  type FacetSection,
} from '@simpletpv/ui';
import { usePageHeader } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, MessageCircle, PackageCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { listStores } from './lib/sales.js';
import { listIncomingStoreOrders, receiveStoreOrder } from './lib/store-orders.js';
import { StoreOrderChatModal } from './StoreOrderChatModal.js';

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
  // Chat (pop-up) del pedido abierto desde el botón de comentarios de la fila.
  const [chatOrder, setChatOrder] = useState<StoreOrder | null>(null);
  // Carril de facetas (buscador + vista por estado), como el Catálogo del admin.
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'all' | 'SENT' | 'RECEIVED'>('all');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const toggleGroup = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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

  // Parche inmutable de una línea, preservando el resto de campos (cantidad/nota).
  function patchLine(id: string, patch: Partial<LineInput>) {
    setLines((prev) => ({
      ...prev,
      [id]: { received: '', note: '', ...prev[id], ...patch },
    }));
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
    patchLine(line.id, { received: String(Number(lines[line.id]?.received ?? 0) + 1) });
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

  // Solo la hora "HH:mm" (la fecha ya la da la cabecera del grupo por día).
  function fmtTime(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }

  // Etiqueta de día (cabecera de grupo): "Lunes, 5 de mayo de 2025".
  function dayLabel(iso: string | null): string {
    if (!iso) return 'Sin fecha';
    const raw = new Date(iso).toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  // ¿Incidencia abierta? Recibido/cerrado con faltante o nota y aún sin resolver.
  function orderIncidentOpen(o: StoreOrder): boolean {
    const showRecv = o.status === 'RECEIVED' || o.status === 'CLOSED';
    if (!showRecv || o.incidentResolvedAt) return false;
    return o.lines.some((l) => {
      const recv = l.quantityReceived == null ? null : Number(l.quantityReceived);
      const short = recv != null && recv < Number(l.quantitySent);
      const note = (l.discrepancyNote ?? '').trim() !== '';
      return short || note;
    });
  }

  // Recuentos por vista (sobre el conjunto completo, antes de filtrar) como en el Catálogo.
  const viewCounts = useMemo(
    () => ({
      all: orders.length,
      SENT: orders.filter((t) => t.status === 'SENT').length,
      RECEIVED: orders.filter((t) => t.status === 'RECEIVED').length,
    }),
    [orders],
  );

  // Filtro: por vista (estado) y por texto (origen/fecha/nº líneas).
  const term = search.trim().toLowerCase();
  const visibleOrders = useMemo(
    () =>
      orders.filter((t) => {
        if (view !== 'all' && t.status !== view) return false;
        if (term === '') return true;
        const haystack = `central ${fmt(t.sentAt ?? t.createdAt)} ${t.lines.length}`.toLowerCase();
        return haystack.includes(term);
      }),
    [orders, view, term],
  );

  // Agrupa los pedidos por día (más reciente primero; dentro, hora descendente).
  const orderGroups = useMemo<FacetedGroup<StoreOrder>[]>(() => {
    const map = new Map<string, { ts: number; rows: StoreOrder[] }>();
    for (const o of visibleOrders) {
      const iso = o.sentAt ?? o.createdAt;
      const d = new Date(iso);
      const key = d.toDateString();
      let g = map.get(key);
      if (!g) {
        g = { ts: d.getTime(), rows: [] };
        map.set(key, g);
      }
      g.rows.push(o);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].ts - a[1].ts)
      .map(([key, g]) => {
        const rows = g.rows.sort(
          (a, b) =>
            new Date(b.sentAt ?? b.createdAt).getTime() -
            new Date(a.sentAt ?? a.createdAt).getTime(),
        );
        return {
          key,
          label: dayLabel(rows[0]?.sentAt ?? rows[0]?.createdAt ?? null),
          meta: `${rows.length} ${rows.length === 1 ? 'pedido' : 'pedidos'}`,
          rows,
        };
      });
  }, [visibleOrders]);

  const orderFacets: FacetSection[] = [
    {
      kind: 'views',
      title: 'Estado',
      options: [
        { key: 'all', label: 'Todos los pedidos', count: viewCounts.all },
        { key: 'SENT', label: 'Pendientes', count: viewCounts.SENT },
        { key: 'RECEIVED', label: 'Recibidos', count: viewCounts.RECEIVED },
      ],
      active: view,
      onSelect: (key) => setView(key as 'all' | 'SENT' | 'RECEIVED'),
      testIdPrefix: 'store-order-view',
    },
  ];

  const orderColumns: FacetedColumn<StoreOrder>[] = [
    {
      key: 'origin',
      header: 'Origen',
      variant: 'name',
      render: () => 'Central',
    },
    {
      key: 'time',
      header: 'Hora',
      variant: 'mid',
      width: 'num',
      render: (t) => fmtTime(t.sentAt ?? t.createdAt),
    },
    {
      key: 'lines',
      header: 'Líneas',
      variant: 'mid',
      width: 'mid',
      render: (t) => t.lines.length,
    },
    {
      key: 'status',
      header: 'Estado',
      variant: 'state',
      width: 'mid',
      render: (t) => {
        const received = t.status === 'RECEIVED';
        return (
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
        );
      },
    },
    {
      key: 'action',
      header: '',
      variant: 'num',
      render: (t) => (
        <span className="store-order-actions">
          {t.status !== 'RECEIVED' && (
            <button
              type="button"
              className="link-btn link-btn--receive"
              onClick={(e) => {
                e.stopPropagation();
                openOrder(t);
              }}
              data-testid="store-order-open"
            >
              <PackageCheck size={15} strokeWidth={2.25} aria-hidden="true" />
              Recibir
            </button>
          )}
          <button
            type="button"
            className="store-order-chat-btn"
            onClick={(e) => {
              e.stopPropagation();
              setChatOrder(t);
            }}
            title="Comentarios con central"
            aria-label="Comentarios con central"
            data-testid="store-order-chat-open"
          >
            <MessageCircle size={16} aria-hidden="true" />
          </button>
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="transfer-view" data-testid="store-order-receive">
        <FacetedTable<StoreOrder>
          railLabel="Filtros de pedidos"
          railTestId="store-order-facets"
          mainTestId="store-order-list"
          rowTestId="store-order-item"
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Buscar por origen o fecha…',
            testId: 'store-order-search',
          }}
          sections={orderFacets}
          columns={orderColumns}
          groups={orderGroups}
          rowKey={(t) => t.id}
          collapsedKeys={collapsed}
          onToggleGroup={toggleGroup}
          onRowClick={(t) => {
            if (t.status !== 'RECEIVED') openOrder(t);
          }}
          emptyState={
            <span
              data-testid={orders.length === 0 ? 'store-order-empty' : 'store-order-no-results'}
            >
              {isLoading
                ? 'Cargando…'
                : orders.length === 0
                  ? 'No hay pedidos pendientes de recibir.'
                  : 'Sin pedidos que coincidan con el filtro.'}
            </span>
          }
        />
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
                <DataTable<StoreOrder['lines'][number]>
                  bare
                  data-testid="store-order-lines"
                  rowTestId="store-order-line"
                  rows={selected.lines}
                  rowKey={(l) => l.id}
                  columns={[
                    {
                      key: 'product',
                      header: 'Producto',
                      render: (l) => l.productName ?? `${l.productId.slice(0, 8)}...`,
                    },
                    {
                      key: 'sent',
                      header: 'Enviado',
                      align: 'right',
                      noWrap: true,
                      render: (l) => <span className="recv-table__sent">{l.quantitySent}</span>,
                    },
                    {
                      key: 'received',
                      header: 'Recibido',
                      align: 'right',
                      noWrap: true,
                      render: (l) => (
                        <input
                          type="number"
                          min={0}
                          value={lines[l.id]?.received ?? ''}
                          onChange={(e) => patchLine(l.id, { received: e.target.value })}
                          data-testid="store-order-received-input"
                          className="recv-input recv-input--num"
                        />
                      ),
                    },
                    {
                      key: 'note',
                      header: 'Nota discrepancia',
                      render: (l) => (
                        <input
                          type="text"
                          placeholder="(opcional)"
                          value={lines[l.id]?.note ?? ''}
                          onChange={(e) => patchLine(l.id, { note: e.target.value })}
                          data-testid="store-order-note-input"
                          className="recv-input"
                        />
                      ),
                    },
                  ]}
                />
              </div>

              <p className="recv-hint">
                ¿Algo roto o incompleto? Cuéntaselo a central con fotos en{' '}
                <strong>Comentarios</strong> (botón de la lista).
              </p>

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

      {chatOrder && (
        <StoreOrderChatModal
          orderId={chatOrder.id}
          title="Comentarios con central"
          subtitle={`Central · ${fmt(chatOrder.sentAt ?? chatOrder.createdAt)}`}
          incidentOpen={orderIncidentOpen(chatOrder)}
          onClose={() => setChatOrder(null)}
        />
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

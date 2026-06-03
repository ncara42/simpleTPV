import { ApiError, type StoreOrder } from '@simpletpv/auth';
import { Button } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { listStores } from './lib/sales.js';
import { listIncomingStoreOrders, receiveStoreOrder } from './lib/store-orders.js';

interface LineInput {
  received: string;
  note: string;
}

export function StoreOrderReceivePanel() {
  const qc = useQueryClient();
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const activeStore = stores[0]?.id ?? null;

  const [selected, setSelected] = useState<StoreOrder | null>(null);
  const [lines, setLines] = useState<Record<string, LineInput>>({});
  const [done, setDone] = useState(false);
  const [scan, setScan] = useState('');

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

  if (done) {
    return (
      <div className="mx-auto max-w-xl space-y-4" data-testid="store-order-received">
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="text-sm font-semibold text-green-700">Pedido recibido</p>
          <p className="mt-1 text-sm text-green-600">El stock se ha actualizado correctamente.</p>
        </div>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setDone(false)}
          data-testid="store-order-back"
        >
          Ver pedidos pendientes
        </Button>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="mx-auto max-w-2xl space-y-4" data-testid="store-order-receive-detail">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Recepción de pedido</h2>
          <button
            className="text-xs font-medium text-neutral-400 hover:text-neutral-700"
            onClick={() => setSelected(null)}
          >
            ← Volver
          </button>
        </div>

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

        <div className="overflow-hidden rounded-xl border border-[var(--ui-border)] bg-white">
          <table className="w-full text-sm" data-testid="store-order-lines">
            <thead>
              <tr className="border-b border-[var(--ui-border)] bg-neutral-50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-neutral-500">
                  Producto
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-neutral-500">
                  Enviado
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-neutral-500">
                  Recibido
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-neutral-500">
                  Nota discrepancia
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ui-border)]">
              {selected.lines.map((l) => (
                <tr key={l.id} data-testid="store-order-line">
                  <td className="px-4 py-3 text-xs text-neutral-700">
                    {l.productName ?? `${l.productId.slice(0, 8)}...`}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-neutral-700">
                    {l.quantitySent}
                  </td>
                  <td className="px-4 py-3 text-center">
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
                      className="h-8 w-20 rounded-md border border-[var(--ui-border)] bg-white px-2 text-center text-sm tabular-nums outline-none focus:border-neutral-400"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      placeholder="(opcional)"
                      value={lines[l.id]?.note ?? ''}
                      onChange={(e) =>
                        setLines((prev) => ({
                          ...prev,
                          [l.id]: { received: prev[l.id]?.received ?? '', note: e.target.value },
                        }))
                      }
                      data-testid="store-order-note-input"
                      className="h-8 w-full rounded-md border border-[var(--ui-border)] bg-white px-2 text-sm outline-none placeholder:text-neutral-300 focus:border-neutral-400"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2">
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
        </div>

        {receiveMutation.isError && (
          <p className="text-sm text-red-600" data-testid="transfer-error">
            {receiveMutation.error instanceof ApiError
              ? receiveMutation.error.message
              : 'No se pudo recibir el pedido.'}
          </p>
        )}
      </div>
    );
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

  return (
    <div className="transfer-view" data-testid="store-order-receive">
      <div className="transfer-view-head">
        <h2 className="transfer-view-title">Recepción de pedidos</h2>
        <p className="transfer-view-sub">Mercancía enviada desde central</p>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-neutral-400">Cargando…</p>
      ) : orders.length === 0 ? (
        <div className="transfer-empty" data-testid="store-order-empty">
          <p className="text-sm text-neutral-400">No hay pedidos pendientes de recibir.</p>
        </div>
      ) : (
        <table className="transfer-table" data-testid="store-order-list">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Origen</th>
              <th className="num">Líneas</th>
              <th>Estado</th>
              <th aria-label="Acción" />
            </tr>
          </thead>
          <tbody>
            {orders.map((t) => {
              const received = t.status === 'RECEIVED';
              return (
                <tr key={t.id} data-testid="store-order-item">
                  <td>{fmt(t.sentAt ?? t.createdAt)}</td>
                  <td>Central</td>
                  <td className="num">{t.lines.length}</td>
                  <td>
                    {received ? (
                      <span className="transfer-badge received" data-testid="store-order-status">
                        <span className="cash-dot" /> Recibido
                      </span>
                    ) : (
                      <span className="transfer-badge pending" data-testid="store-order-status">
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="action">
                    {!received && (
                      <button
                        className="transfer-receive-link"
                        onClick={() => openOrder(t)}
                        data-testid="store-order-open"
                      >
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
  );
}

import { ApiError, type Transfer } from '@simpletpv/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { listStores } from './lib/sales.js';
import { listIncomingTransfers, receiveTransfer } from './lib/transfers.js';

interface LineInput {
  received: string;
  note: string;
}

// Pantalla de recepción de traspasos en la tienda (#34): el responsable lista
// los traspasos SENT dirigidos a su tienda, indica la cantidad recibida por
// línea (precargada con lo enviado) y una nota de discrepancia opcional, y
// confirma. El backend calcula la discrepancia e incrementa el stock del destino.
export function TransferReceivePanel() {
  const qc = useQueryClient();
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const [storeId, setStoreId] = useState<string | null>(null);
  const activeStore = storeId ?? stores[0]?.id ?? null;

  const [selected, setSelected] = useState<Transfer | null>(null);
  const [lines, setLines] = useState<Record<string, LineInput>>({});
  const [done, setDone] = useState(false);

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['incoming-transfers', activeStore],
    queryFn: () => listIncomingTransfers(activeStore as string),
    enabled: activeStore !== null,
  });

  const receiveMutation = useMutation({
    mutationFn: (t: Transfer) =>
      receiveTransfer(t.id, {
        lines: t.lines.map((l) => ({
          lineId: l.id,
          quantityReceived: Number(lines[l.id]?.received ?? l.quantitySent),
          ...(lines[l.id]?.note ? { discrepancyNote: lines[l.id]!.note } : {}),
        })),
      }),
    onSuccess: () => {
      setDone(true);
      setSelected(null);
      void qc.invalidateQueries({ queryKey: ['incoming-transfers', activeStore] });
      void qc.invalidateQueries({ queryKey: ['store-stock', activeStore] });
    },
  });

  function openTransfer(t: Transfer) {
    setDone(false);
    setSelected(t);
    // Precarga la cantidad recibida con lo enviado (caso habitual: todo OK).
    const init: Record<string, LineInput> = {};
    for (const l of t.lines) {
      init[l.id] = { received: String(l.quantitySent), note: '' };
    }
    setLines(init);
  }

  if (done) {
    return (
      <div className="transfer-receive" data-testid="transfer-received">
        <p className="sale-empty">Traspaso recibido. El stock se ha actualizado.</p>
        <button className="btn-primary" onClick={() => setDone(false)} data-testid="transfer-back">
          Ver traspasos pendientes
        </button>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="transfer-receive" data-testid="transfer-receive-detail">
        {stores.length > 1 && <h2>Recepción de traspaso</h2>}
        <table className="cart-table" data-testid="transfer-lines">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Enviado</th>
              <th>Recibido</th>
              <th>Nota discrepancia</th>
            </tr>
          </thead>
          <tbody>
            {selected.lines.map((l) => (
              <tr key={l.id} data-testid="transfer-line">
                <td className="muted">{l.productId.slice(0, 8)}…</td>
                <td>{l.quantitySent}</td>
                <td>
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
                    data-testid="transfer-received-input"
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
                        [l.id]: { received: prev[l.id]?.received ?? '', note: e.target.value },
                      }))
                    }
                    data-testid="transfer-note-input"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="transfer-actions">
          <button onClick={() => setSelected(null)} data-testid="transfer-cancel">
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={receiveMutation.isPending}
            onClick={() => receiveMutation.mutate(selected)}
            data-testid="transfer-confirm"
          >
            Confirmar recepción
          </button>
        </div>
        {receiveMutation.isError && (
          <p className="cart-msg" data-testid="transfer-error">
            {receiveMutation.error instanceof ApiError
              ? receiveMutation.error.message
              : 'No se pudo recibir el traspaso.'}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="transfer-receive" data-testid="transfer-receive">
      {stores.length > 1 && (
        <div className="sale-store-row">
          <label>
            Tienda:{' '}
            <select
              value={activeStore ?? ''}
              onChange={(e) => setStoreId(e.target.value)}
              data-testid="transfer-store-select"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {isLoading ? (
        <p className="sale-empty">Cargando…</p>
      ) : transfers.length === 0 ? (
        <p className="sale-empty" data-testid="transfer-empty">
          No hay traspasos pendientes de recibir.
        </p>
      ) : (
        <ul className="transfer-list" data-testid="transfer-list">
          {transfers.map((t) => (
            <li key={t.id} data-testid="transfer-item">
              <span>
                {t.lines.length} líneas · enviado{' '}
                {t.sentAt ? new Date(t.sentAt).toLocaleString('es-ES') : '—'}
              </span>
              <button
                className="btn-primary"
                onClick={() => openTransfer(t)}
                data-testid="transfer-open"
              >
                Recibir
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { ApiError } from '@simpletpv/auth';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { type Product, searchProducts } from './lib/catalog.js';
import { createBlindReturn } from './lib/returns.js';
import { listStores } from './lib/sales.js';
import { useDebounce } from './lib/useDebounce.js';

// Devolución SIN ticket (#59): buscar producto, cantidad, motivo obligatorio, y
// autorización por PIN de un MANAGER/ADMIN. El importe lo calcula el servidor.
export function BlindReturnPanel() {
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const [storeId, setStoreId] = useState<string | null>(null);
  const activeStore = storeId ?? stores[0]?.id ?? null;

  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 200);
  const [picked, setPicked] = useState<Product | null>(null);
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ total: number } | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ['blind-products', debounced],
    queryFn: () => searchProducts(debounced, null),
    enabled: picked === null && debounced.length > 0,
  });

  const canConfirm =
    !!activeStore &&
    !!picked &&
    Number(qty) > 0 &&
    reason.trim().length > 0 &&
    pin.length >= 4 &&
    !busy;

  async function onConfirm() {
    if (!canConfirm || !picked || !activeStore) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createBlindReturn({
        storeId: activeStore,
        reason: reason.trim(),
        managerPin: pin,
        lines: [{ productId: picked.id, qty: Number(qty) }],
      });
      setDone({ total: Number(result.total) });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setError('PIN de autorización inválido. Pide a un responsable que lo introduzca.');
      } else if (e instanceof ApiError && e.status === 400) {
        setError(e.body ?? 'Datos de devolución inválidos.');
      } else {
        setError('Error al registrar la devolución. Inténtalo de nuevo.');
      }
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setSearch('');
    setPicked(null);
    setQty('1');
    setReason('');
    setPin('');
    setError(null);
    setDone(null);
  }

  if (done) {
    return (
      <div className="return-panel" data-testid="blind-return-panel">
        <h2 className="cart-title">Devolución sin ticket registrada</h2>
        <p className="return-done" data-testid="blind-return-done">
          Total devuelto: <strong>{done.total.toFixed(2)} €</strong>
        </p>
        <button className="cart-create" onClick={reset} data-testid="blind-return-new">
          Nueva devolución
        </button>
      </div>
    );
  }

  return (
    <div className="return-panel" data-testid="blind-return-panel">
      <h2 className="cart-title">Devolución sin ticket</h2>

      {stores.length > 1 && (
        <div className="sale-store-row">
          <label>
            Tienda:{' '}
            <select
              value={activeStore ?? ''}
              onChange={(e) => setStoreId(e.target.value)}
              data-testid="blind-store-select"
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

      {picked ? (
        <div className="blind-picked" data-testid="blind-picked">
          <span>
            Producto: <strong>{picked.name}</strong>
          </span>
          <button className="link-btn" onClick={() => setPicked(null)} data-testid="blind-change">
            Cambiar
          </button>
        </div>
      ) : (
        <>
          <input
            className="sale-search"
            placeholder="Buscar producto a devolver…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="blind-search"
          />
          {products.length > 0 && (
            <ul className="blind-results" data-testid="blind-results">
              {products.map((p) => (
                <li key={p.id}>
                  <button
                    className="link-btn"
                    onClick={() => setPicked(p)}
                    data-testid="blind-result"
                  >
                    {p.name} · {Number(p.salePrice).toFixed(2)} €
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <label className="blind-field">
        Cantidad
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          data-testid="blind-qty"
        />
      </label>

      <label className="blind-field">
        Motivo (obligatorio)
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          data-testid="blind-reason"
        />
      </label>

      <label className="blind-field">
        PIN de autorización (MANAGER/ADMIN)
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          data-testid="blind-pin"
        />
      </label>

      {error && (
        <p className="cart-msg" data-testid="blind-error">
          {error}
        </p>
      )}

      <button
        className="cart-create"
        disabled={!canConfirm}
        onClick={onConfirm}
        data-testid="blind-confirm"
      >
        {busy ? 'Registrando…' : 'Registrar devolución'}
      </button>
    </div>
  );
}

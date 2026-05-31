import { ApiError } from '@simpletpv/auth';
import { Button } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { type Product, searchProducts } from './lib/catalog.js';
import { createBlindReturn } from './lib/returns.js';
import { listStores } from './lib/sales.js';
import { useDebounce } from './lib/useDebounce.js';

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
      <div className="mx-auto max-w-xl space-y-4" data-testid="blind-return-panel">
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="text-sm font-semibold text-green-700">Devolución sin ticket registrada</p>
          <p
            className="mt-1 text-2xl font-bold tabular-nums text-green-800"
            data-testid="blind-return-done"
          >
            {done.total.toFixed(2)} € devueltos
          </p>
        </div>
        <Button
          variant="secondary"
          className="w-full"
          onClick={reset}
          data-testid="blind-return-new"
        >
          Nueva devolución
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4" data-testid="blind-return-panel">
      <h2 className="text-sm font-semibold text-neutral-700">Devolución sin ticket</h2>

      {stores.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <label className="text-neutral-500 font-medium shrink-0">Tienda</label>
          <select
            value={activeStore ?? ''}
            onChange={(e) => setStoreId(e.target.value)}
            data-testid="blind-store-select"
            className="h-8 flex-1 rounded-md border border-[var(--ui-border)] bg-white px-2 text-sm outline-none focus:border-neutral-400"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Selección de producto */}
      {picked ? (
        <div
          className="flex items-center justify-between rounded-lg border border-[var(--ui-border)] bg-neutral-50 px-4 py-3"
          data-testid="blind-picked"
        >
          <div>
            <p className="text-xs text-neutral-400">Producto seleccionado</p>
            <p className="text-sm font-semibold text-neutral-900">{picked.name}</p>
          </div>
          <button
            className="text-xs font-medium text-neutral-500 hover:text-neutral-800 underline"
            onClick={() => setPicked(null)}
            data-testid="blind-change"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            className="h-9 w-full rounded-lg border border-[var(--ui-border)] bg-white px-3 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
            placeholder="Buscar producto a devolver…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="blind-search"
          />
          {products.length > 0 && (
            <ul
              className="rounded-lg border border-[var(--ui-border)] bg-white divide-y divide-[var(--ui-border)]"
              data-testid="blind-results"
            >
              {products.map((p) => (
                <li key={p.id}>
                  <button
                    className="w-full px-4 py-2.5 text-left text-sm text-neutral-800 hover:bg-neutral-50"
                    onClick={() => setPicked(p)}
                    data-testid="blind-result"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 tabular-nums text-neutral-400">
                      {Number(p.salePrice).toFixed(2)} €
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Campos */}
      <div className="space-y-3 rounded-xl border border-[var(--ui-border)] bg-white p-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-neutral-500">Cantidad</span>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            data-testid="blind-qty"
            className="h-9 w-full rounded-lg border border-[var(--ui-border)] bg-white px-3 text-sm outline-none focus:border-neutral-400"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-neutral-500">Motivo (obligatorio)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid="blind-reason"
            className="h-9 w-full rounded-lg border border-[var(--ui-border)] bg-white px-3 text-sm outline-none focus:border-neutral-400"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-neutral-500">
            PIN de autorización (MANAGER/ADMIN)
          </span>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            data-testid="blind-pin"
            className="h-9 w-full rounded-lg border border-[var(--ui-border)] bg-white px-3 text-sm outline-none focus:border-neutral-400"
          />
        </label>
      </div>

      {error && (
        <p className="text-sm text-red-600" data-testid="blind-error">
          {error}
        </p>
      )}

      <Button
        className="w-full"
        disabled={!canConfirm}
        onClick={onConfirm}
        data-testid="blind-confirm"
      >
        {busy ? 'Registrando…' : 'Registrar devolución'}
      </Button>
    </div>
  );
}

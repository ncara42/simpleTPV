import { ApiError, type CashSession } from '@simpletpv/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { closeCashSession, currentCashSession, openCashSession } from './lib/cash.js';

export function CashPanel({ storeId }: { storeId: string | null }) {
  const queryClient = useQueryClient();
  const [openingAmount, setOpeningAmount] = useState('');
  const [countedAmount, setCountedAmount] = useState('');
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<CashSession | null>(null);

  const queryKey = ['cash-session', storeId];
  const { data: session, isLoading } = useQuery({
    queryKey,
    queryFn: () => currentCashSession(storeId as string),
    enabled: storeId !== null,
  });

  const openMutation = useMutation({
    mutationFn: (amount: number) =>
      openCashSession({ storeId: storeId as string, openingAmount: amount }),
    onSuccess: () => {
      setOpeningAmount('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: unknown) => {
      setError(
        e instanceof ApiError
          ? (e.body ?? 'No se pudo abrir la caja.')
          : 'No se pudo abrir la caja.',
      );
    },
  });

  const closeMutation = useMutation({
    mutationFn: (amount: number) => closeCashSession(session!.id, amount),
    onSuccess: (result) => {
      setCountedAmount('');
      setClosing(false);
      setError(null);
      setClosed(result);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: unknown) => {
      setError(
        e instanceof ApiError
          ? (e.body ?? 'No se pudo cerrar la caja.')
          : 'No se pudo cerrar la caja.',
      );
    },
  });

  if (storeId === null || isLoading) return null;

  // Resumen de cierre con cuadre
  if (closed) {
    const expected = Number(closed.expectedAmount ?? 0);
    const counted = Number(closed.closingAmount ?? 0);
    const difference = Number(closed.difference ?? 0);
    const diffColor =
      difference > 0 ? 'text-green-700' : difference < 0 ? 'text-red-600' : 'text-neutral-600';

    return (
      <section
        className="rounded-lg border border-[var(--ui-border)] bg-white p-3.5"
        data-testid="cash-panel"
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600"
            data-testid="cash-status"
          >
            Caja cerrada
          </span>
        </div>
        <div
          className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] divide-y divide-[var(--ui-border)]"
          data-testid="cash-summary"
        >
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-neutral-500">Esperado</span>
            <span className="tabular-nums font-medium" data-testid="cash-expected">
              {expected.toFixed(2)} €
            </span>
          </div>
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-neutral-500">Contado</span>
            <span className="tabular-nums font-medium" data-testid="cash-counted-result">
              {counted.toFixed(2)} €
            </span>
          </div>
          <div className={`flex justify-between px-3 py-2 text-sm font-bold ${diffColor}`}>
            <span>Diferencia</span>
            <span className="tabular-nums" data-testid="cash-difference">
              {difference > 0 ? '+' : ''}
              {difference.toFixed(2)} €
            </span>
          </div>
        </div>
        <button
          className="mt-3 h-8 w-full rounded-md border border-[var(--ui-border)] bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          onClick={() => setClosed(null)}
          data-testid="cash-dismiss"
        >
          Aceptar
        </button>
      </section>
    );
  }

  // Caja abierta
  if (session) {
    const opening = Number(session.openingAmount);
    const counted = Number(countedAmount);
    const hasCounted = countedAmount !== '' && !Number.isNaN(counted) && counted >= 0;

    return (
      <section
        className="rounded-lg border border-[var(--ui-border)] bg-white p-3.5"
        data-testid="cash-panel"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700"
              data-testid="cash-status"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Caja abierta
            </span>
            <span className="text-xs tabular-nums text-neutral-500" data-testid="cash-opening">
              Inicial: {opening.toFixed(2)} €
            </span>
          </div>

          {!closing && (
            <button
              className="h-7 rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
              onClick={() => setClosing(true)}
              data-testid="cash-close"
            >
              Cerrar caja
            </button>
          )}
        </div>

        {closing && (
          <form
            className="mt-3 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (hasCounted) closeMutation.mutate(counted);
            }}
          >
            <label className="flex-1 space-y-1">
              <span className="text-xs font-medium text-neutral-500">Efectivo contado</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={countedAmount}
                onChange={(e) => setCountedAmount(e.target.value)}
                data-testid="cash-counted"
                autoFocus
                className="h-9 w-full rounded-md border border-[var(--ui-border)] bg-white px-3 text-sm tabular-nums outline-none focus:border-neutral-400"
              />
            </label>
            <button
              type="button"
              className="h-9 rounded-md border border-[var(--ui-border)] bg-white px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
              onClick={() => {
                setClosing(false);
                setCountedAmount('');
                setError(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!hasCounted || closeMutation.isPending}
              data-testid="cash-close-confirm"
              className="h-9 rounded-md border border-red-200 bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {closeMutation.isPending ? 'Cerrando…' : 'Confirmar'}
            </button>
          </form>
        )}

        {error && (
          <p className="mt-2 text-xs text-red-600" data-testid="cash-error">
            {error}
          </p>
        )}
      </section>
    );
  }

  // Sin caja abierta — formulario apertura
  const opening = Number(openingAmount);
  const hasOpening = openingAmount !== '' && !Number.isNaN(opening) && opening >= 0;

  return (
    <section
      className="rounded-lg border border-amber-200 bg-amber-50 p-3.5"
      data-testid="cash-panel"
    >
      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700"
          data-testid="cash-status"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Caja cerrada
        </span>
        <span className="text-xs text-amber-600">Abre la caja para cobrar</span>
      </div>
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (hasOpening) openMutation.mutate(opening);
        }}
      >
        <label className="flex-1 space-y-1">
          <span className="text-xs font-medium text-amber-700">Efectivo inicial</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={openingAmount}
            onChange={(e) => setOpeningAmount(e.target.value)}
            data-testid="cash-opening-amount"
            className="h-9 w-full rounded-md border border-amber-200 bg-white px-3 text-sm tabular-nums outline-none focus:border-amber-400"
          />
        </label>
        <button
          type="submit"
          disabled={!hasOpening || openMutation.isPending}
          data-testid="cash-open"
          className="h-9 rounded-md border border-neutral-900 bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {openMutation.isPending ? 'Abriendo…' : 'Abrir caja'}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-xs text-red-600" data-testid="cash-error">
          {error}
        </p>
      )}
    </section>
  );
}

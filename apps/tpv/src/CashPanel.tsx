import { ApiError, type CashSession } from '@simpletpv/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { closeCashSession, currentCashSession, openCashSession } from './lib/cash.js';

// Panel de caja del turno: muestra el estado (abierta/cerrada) de la tienda
// activa y permite abrir (con efectivo inicial) o cerrar (con efectivo contado,
// mostrando el cuadre que devuelve el servidor). La caja es OPCIONAL: no
// bloquea la venta.
export function CashPanel({ storeId }: { storeId: string | null }) {
  const queryClient = useQueryClient();
  const [openingAmount, setOpeningAmount] = useState('');
  const [countedAmount, setCountedAmount] = useState('');
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Resultado del cierre: el cuadre real (esperado/contado/diferencia) que
  // calcula la API sumando las ventas en efectivo del turno.
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

  if (storeId === null || isLoading) {
    return null;
  }

  // Resumen de cierre con el cuadre real del servidor.
  if (closed) {
    const expected = Number(closed.expectedAmount ?? 0);
    const counted = Number(closed.closingAmount ?? 0);
    const difference = Number(closed.difference ?? 0);
    const sign = difference > 0 ? 'positive' : difference < 0 ? 'negative' : 'zero';
    return (
      <section className="cash-panel cash-closed-summary" data-testid="cash-panel">
        <div className="cash-status">
          <span className="cash-badge cash-badge-closed" data-testid="cash-status">
            Caja cerrada
          </span>
        </div>
        <div className="cash-reconciliation" data-testid="cash-summary">
          <div className="cash-recon-row">
            <span>Esperado</span>
            <span data-testid="cash-expected">{expected.toFixed(2)} €</span>
          </div>
          <div className="cash-recon-row">
            <span>Contado</span>
            <span data-testid="cash-counted-result">{counted.toFixed(2)} €</span>
          </div>
          <div className={`cash-recon-row cash-diff cash-diff-${sign}`}>
            <span>Diferencia</span>
            <span data-testid="cash-difference">
              {difference > 0 ? '+' : ''}
              {difference.toFixed(2)} €
            </span>
          </div>
        </div>
        <button
          className="cash-btn-open"
          onClick={() => setClosed(null)}
          data-testid="cash-dismiss"
        >
          Aceptar
        </button>
      </section>
    );
  }

  // Caja abierta: estado + botón/formulario de cierre.
  if (session) {
    const opening = Number(session.openingAmount);
    const counted = Number(countedAmount);
    const hasCounted = countedAmount !== '' && !Number.isNaN(counted) && counted >= 0;

    return (
      <section className="cash-panel cash-open-state" data-testid="cash-panel">
        <div className="cash-status">
          <span className="cash-badge cash-badge-open" data-testid="cash-status">
            Caja abierta
          </span>
          <span className="cash-opening" data-testid="cash-opening">
            Inicial: {opening.toFixed(2)} €
          </span>
        </div>

        {closing ? (
          <form
            className="cash-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (hasCounted) closeMutation.mutate(counted);
            }}
          >
            <label className="cash-field">
              Efectivo contado
              <input
                type="number"
                min="0"
                step="0.01"
                value={countedAmount}
                onChange={(e) => setCountedAmount(e.target.value)}
                data-testid="cash-counted"
                autoFocus
              />
            </label>
            <div className="cash-actions">
              <button
                type="button"
                className="cash-btn-cancel"
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
                className="cash-btn-close"
                disabled={!hasCounted || closeMutation.isPending}
                data-testid="cash-close-confirm"
              >
                {closeMutation.isPending ? 'Cerrando…' : 'Cerrar caja'}
              </button>
            </div>
          </form>
        ) : (
          <button
            className="cash-btn-close"
            onClick={() => setClosing(true)}
            data-testid="cash-close"
          >
            Cerrar caja
          </button>
        )}
        {error && (
          <p className="cash-error" data-testid="cash-error">
            {error}
          </p>
        )}
      </section>
    );
  }

  // Sin caja abierta: formulario de apertura con efectivo inicial.
  const opening = Number(openingAmount);
  const hasOpening = openingAmount !== '' && !Number.isNaN(opening) && opening >= 0;

  return (
    <section className="cash-panel cash-closed-state" data-testid="cash-panel">
      <div className="cash-status">
        <span className="cash-badge cash-badge-closed" data-testid="cash-status">
          Caja cerrada
        </span>
      </div>
      <form
        className="cash-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (hasOpening) openMutation.mutate(opening);
        }}
      >
        <label className="cash-field">
          Efectivo inicial
          <input
            type="number"
            min="0"
            step="0.01"
            value={openingAmount}
            onChange={(e) => setOpeningAmount(e.target.value)}
            data-testid="cash-opening-amount"
          />
        </label>
        <button
          type="submit"
          className="cash-btn-open"
          disabled={!hasOpening || openMutation.isPending}
          data-testid="cash-open"
        >
          {openMutation.isPending ? 'Abriendo…' : 'Abrir caja'}
        </button>
      </form>
      {error && (
        <p className="cash-error" data-testid="cash-error">
          {error}
        </p>
      )}
    </section>
  );
}

import { ApiError, type CashSession } from '@simpletpv/auth';
import { Select } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CashCount } from './CashCount.js';
import {
  DEMO_CASH_EXPECTED,
  DEMO_CASH_OPENING,
  DEMO_CASH_SALES,
  DEMO_STORE_ID,
} from './demo/demoData.js';
import { useAuthStore } from './lib/auth.js';
import {
  closeCashSession,
  createCashMovement,
  currentCashSession,
  listCashMovements,
  openCashSession,
} from './lib/cash.js';
import { eur } from './lib/format.js';

export function CashPanel({ storeId }: { storeId: string | null }) {
  const queryClient = useQueryClient();
  const [openingAmount, setOpeningAmount] = useState('');
  // Total contado, alimentado por el contador de denominaciones (CashCount).
  const [counted, setCounted] = useState(0);
  const [closing, setClosing] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('OUT');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<CashSession | null>(null);
  const role = useAuthStore((s) => s.getRole());
  const canManageMovements = role === 'ADMIN' || role === 'MANAGER';

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

  const movementsQuery = useQuery({
    queryKey: ['cash-movements', session?.id],
    queryFn: () => listCashMovements(session!.id),
    enabled: session !== null && session !== undefined,
  });

  const movementMutation = useMutation({
    mutationFn: () =>
      createCashMovement(session!.id, {
        type: movementType,
        amount: Number(movementAmount),
        reason: movementReason.trim(),
      }),
    onSuccess: () => {
      setMovementAmount('');
      setMovementReason('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['cash-movements', session?.id] });
    },
    onError: (e: unknown) => {
      setError(
        e instanceof ApiError
          ? (e.body ?? 'No se pudo registrar el movimiento.')
          : 'No se pudo registrar el movimiento.',
      );
    },
  });

  const closeMutation = useMutation({
    mutationFn: (amount: number) => closeCashSession(session!.id, amount),
    onSuccess: (result) => {
      setCounted(0);
      // El cierre se confirmó: descartamos el borrador del conteo persistido.
      try {
        localStorage.removeItem(`cash-count:${result.id}`);
      } catch {
        // localStorage no disponible: nada que limpiar.
      }
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
      <section className="cash-panel closed" data-testid="cash-panel">
        <div className="cash-bar">
          <div className="cash-status">
            <span className="cash-dot" />
            <span className="cash-badge" data-testid="cash-status">
              Caja cerrada
            </span>
          </div>
        </div>
        <div className="cash-form" style={{ paddingTop: 0 }}>
          <div className="cash-reconciliation" data-testid="cash-summary">
            <div className="cash-recon-row">
              <span style={{ color: 'var(--ui-text-muted)' }}>Esperado</span>
              <span data-testid="cash-expected">{eur(expected)} €</span>
            </div>
            <div className="cash-recon-row">
              <span style={{ color: 'var(--ui-text-muted)' }}>Contado</span>
              <span data-testid="cash-counted-result">{eur(counted)} €</span>
            </div>
            <div
              className={`cash-recon-row cash-diff ${diffColor === 'text-green-700' ? 'cash-diff-positive' : diffColor === 'text-red-600' ? 'cash-diff-negative' : 'cash-diff-zero'}`}
            >
              <span>Diferencia</span>
              <span data-testid="cash-difference">
                {difference > 0 ? '+' : ''}
                {eur(difference)} €
              </span>
            </div>
          </div>
          <button
            className="cash-btn-cancel"
            onClick={() => setClosed(null)}
            data-testid="cash-dismiss"
            style={{ width: '100%' }}
          >
            Aceptar
          </button>
        </div>
      </section>
    );
  }

  // Caja abierta
  if (session) {
    const opening = Number(session.openingAmount);

    return (
      <section className="cash-panel" data-testid="cash-panel">
        <div className="cash-bar">
          <div className="cash-status">
            <span className="cash-dot" />
            <span className="cash-badge" data-testid="cash-status">
              Caja abierta
            </span>
          </div>
          <span className="cash-div" />
          <div className="cash-stat">
            <span className="cash-stat-label">Apertura</span>
            <span className="cash-stat-value" data-testid="cash-opening">
              {eur(opening)} €
            </span>
          </div>
          <span className="cash-div" />
          <div className="cash-stat">
            <span className="cash-stat-label">Esperado en caja</span>
            <span className="cash-stat-value" data-testid="cash-expected-bar">
              {eur(Number(session.expectedAmount ?? 0))} €
            </span>
          </div>
          <span className="cash-spacer" />
          {!closing && (
            <button
              className="cash-action"
              onClick={() => setClosing(true)}
              data-testid="cash-close"
            >
              Cerrar caja
            </button>
          )}
        </div>

        {closing && (
          <form
            className="cash-form"
            onSubmit={(e) => {
              e.preventDefault();
              closeMutation.mutate(counted);
            }}
          >
            {/* Conteo por denominaciones (persiste mientras la caja siga abierta). */}
            <CashCount
              expected={Number(session.expectedAmount ?? 0)}
              storageKey={`cash-count:${session.id}`}
              onTotalChange={setCounted}
            />
            <div className="cash-actions">
              <button
                type="button"
                className="cash-btn-cancel"
                onClick={() => {
                  // No limpiamos el conteo: queda persistido para retomarlo.
                  setClosing(false);
                  setError(null);
                }}
                data-testid="cash-close-cancel"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={closeMutation.isPending}
                data-testid="cash-close-confirm"
                className="cash-btn-close"
              >
                {closeMutation.isPending ? 'Cerrando…' : `Confirmar cierre · ${eur(counted)} €`}
              </button>
            </div>
          </form>
        )}

        {!closing && (
          <div className="cash-form" data-testid="cash-movements">
            {canManageMovements ? (
              <div className="cash-movement-form">
                <Select
                  value={movementType}
                  onChange={(value) => setMovementType(value as 'IN' | 'OUT')}
                  options={[
                    { value: 'OUT', label: 'Retirada' },
                    { value: 'IN', label: 'Entrada' },
                  ]}
                  ariaLabel="Tipo de movimiento"
                  data-testid="cash-movement-type"
                />
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                  placeholder="Importe"
                  data-testid="cash-movement-amount"
                />
                <input
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder="Motivo"
                  data-testid="cash-movement-reason"
                />
                <button
                  type="button"
                  className="cash-btn-open"
                  disabled={
                    Number(movementAmount) <= 0 ||
                    movementReason.trim().length < 2 ||
                    movementMutation.isPending
                  }
                  onClick={() => movementMutation.mutate()}
                  data-testid="cash-movement-save"
                >
                  Registrar
                </button>
              </div>
            ) : (
              <p className="cash-movement-note">
                Solo responsables pueden registrar entradas o retiradas.
              </p>
            )}
            {movementsQuery.data && movementsQuery.data.length > 0 && (
              <ul className="cash-movement-list" data-testid="cash-movement-list">
                {movementsQuery.data.map((m) => (
                  <li key={m.id}>
                    <span>
                      {m.type === 'IN' ? 'Entrada' : 'Retirada'} · {m.reason}
                    </span>
                    <strong className="tabular-nums">
                      {m.type === 'IN' ? '+' : '-'}
                      {eur(Number(m.amount))} €
                    </strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && (
          <p className="cash-error" data-testid="cash-error">
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
    <section className="cash-panel closed" data-testid="cash-panel">
      <div className="cash-bar">
        <div className="cash-status">
          <span className="cash-dot" />
          <span className="cash-badge" data-testid="cash-status">
            Caja cerrada
          </span>
        </div>
        <span className="cash-msg">Ábrela para empezar a cobrar este turno.</span>
      </div>
      <form
        className="cash-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (hasOpening) openMutation.mutate(opening);
        }}
      >
        <label className="cash-field">
          <span>Efectivo inicial (€)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={openingAmount}
            onChange={(e) => setOpeningAmount(e.target.value)}
            data-testid="cash-opening-amount"
          />
        </label>
        <div className="cash-actions">
          <button
            type="submit"
            disabled={!hasOpening || openMutation.isPending}
            data-testid="cash-open"
            className="cash-btn-open"
          >
            {openMutation.isPending ? 'Abriendo…' : 'Abrir caja'}
          </button>
        </div>
      </form>
      {error && (
        <p className="cash-error" data-testid="cash-error">
          {error}
        </p>
      )}
    </section>
  );
}

// Vista de Caja calcada al mockup: tarjeta con estado + cifras + cerrar caja.
export function CashView() {
  const [closing, setClosing] = useState(false);

  if (closing) {
    // Reutiliza el panel-barra existente (incluye el formulario de cierre real).
    return (
      <div className="cash-view">
        <CashPanel storeId={DEMO_STORE_ID} />
      </div>
    );
  }

  return (
    <div className="cash-view" data-testid="cash-view">
      <div className="cash-view-head">
        <h2 className="cash-view-title">Sesión de caja</h2>
        <p className="cash-view-sub">Tienda Centro · turno de mañana</p>
      </div>

      <div className="cash-card">
        <div className="cash-card-head">
          <span className="cash-card-title">Estado</span>
          <span className="cash-card-badge" data-testid="cash-state">
            <span className="cash-dot" /> Abierta
          </span>
        </div>
        <dl className="cash-card-rows">
          <div className="cash-card-row">
            <dt>Apertura</dt>
            <dd>{eur(DEMO_CASH_OPENING)} €</dd>
          </div>
          <div className="cash-card-row">
            <dt>Ventas efectivo</dt>
            <dd>+ {eur(DEMO_CASH_SALES)} €</dd>
          </div>
          <div className="cash-card-row">
            <dt>Esperado en caja</dt>
            <dd>{eur(DEMO_CASH_EXPECTED)} €</dd>
          </div>
        </dl>
        <button
          className="cash-card-close"
          onClick={() => setClosing(true)}
          data-testid="cash-view-close"
        >
          Cerrar caja
        </button>
      </div>
    </div>
  );
}

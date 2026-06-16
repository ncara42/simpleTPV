import { ApiError, type CashMovementType, type CashSession } from '@simpletpv/auth';
import { Select } from '@simpletpv/ui';
import { usePageHeader } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CashCloseSummary } from './cash/CashCloseSummary.js';
import { CashClosuresList } from './cash/CashClosuresList.js';
import { CashMovementRow } from './cash/CashMovementRow.js';
import { CashOpenForm } from './cash/CashOpenForm.js';
import { CashCount } from './CashCount.js';
import {
  closeCashSession,
  currentCashSession,
  listCashMovements,
  openCashSession,
  requestCashMovement,
} from './lib/cash.js';
import { eur } from './lib/format.js';
import { listStores } from './lib/sales.js';

export function CashPanel({ storeId }: { storeId: string | null }) {
  usePageHeader('Caja', 'Apertura, cierre y arqueo de caja');
  const queryClient = useQueryClient();
  // Total contado, alimentado por el contador de denominaciones (CashCount).
  const [counted, setCounted] = useState(0);
  const [closing, setClosing] = useState(false);
  // El TPV SOLICITA movimientos (#146): el cajero elige tipo, importe y motivo, y
  // un responsable los aprueba/deniega desde el backoffice.
  const [movementType, setMovementType] = useState<CashMovementType>('OUT');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [closed, setClosed] = useState<CashSession | null>(null);

  // El traspaso a central solo se ofrece si la organización tiene una designada
  // (Store.isCentral). El backend valida igualmente el destino.
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const hasCentral = stores.some((s) => s.isCentral);

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
      requestCashMovement(session!.id, {
        type: movementType,
        amount: Number(movementAmount),
        reason: movementReason.trim(),
      }),
    onSuccess: () => {
      setMovementAmount('');
      setMovementReason('');
      setError(null);
      setRequestSent(true);
      void queryClient.invalidateQueries({ queryKey: ['cash-movements', session?.id] });
    },
    onError: (e: unknown) => {
      setRequestSent(false);
      setError(
        e instanceof ApiError
          ? (e.body ?? 'No se pudo enviar la solicitud.')
          : 'No se pudo enviar la solicitud.',
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
    return <CashCloseSummary session={closed} onDismiss={() => setClosed(null)} />;
  }

  // Caja abierta
  if (session) {
    const opening = Number(session.openingAmount);

    return (
      <>
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
                className="cash-action primary"
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
              <div className="cash-movement-form">
                <Select
                  value={movementType}
                  onChange={(value) => {
                    setMovementType(value as CashMovementType);
                    setRequestSent(false);
                  }}
                  options={[
                    { value: 'OUT', label: 'Retirada' },
                    { value: 'IN', label: 'Entrada' },
                    ...(hasCentral
                      ? [{ value: 'TRANSFER_OUT', label: 'Traspaso a central' }]
                      : []),
                  ]}
                  ariaLabel="Tipo de movimiento"
                  data-testid="cash-movement-type"
                />
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={movementAmount}
                  onChange={(e) => {
                    setMovementAmount(e.target.value);
                    setRequestSent(false);
                  }}
                  placeholder="Importe"
                  data-testid="cash-movement-amount"
                />
                <input
                  value={movementReason}
                  onChange={(e) => {
                    setMovementReason(e.target.value);
                    setRequestSent(false);
                  }}
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
                  Solicitar
                </button>
              </div>
              {requestSent && (
                <p className="cash-movement-note" data-testid="cash-request-sent">
                  Solicitud enviada, pendiente de aprobación.
                </p>
              )}
              {movementsQuery.data && movementsQuery.data.length > 0 && (
                <ul className="cash-movement-list" data-testid="cash-movement-list">
                  {movementsQuery.data.map((m) => (
                    <CashMovementRow key={m.id} movement={m} />
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
        <CashClosuresList storeId={storeId} />
      </>
    );
  }

  // Sin caja abierta — formulario apertura + registro de cierres
  return (
    <>
      <CashOpenForm
        onOpen={(amount) => openMutation.mutate(amount)}
        pending={openMutation.isPending}
        error={error}
      />
      <CashClosuresList storeId={storeId} />
    </>
  );
}

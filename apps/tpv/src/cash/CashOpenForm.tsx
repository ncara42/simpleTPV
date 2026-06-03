import { useState } from 'react';

// Formulario de apertura de caja (estado "cerrada"). Autónomo: gestiona el
// importe inicial y delega la apertura en `onOpen`. El padre pasa pending/error
// de la mutación.
export function CashOpenForm({
  onOpen,
  pending,
  error,
}: {
  onOpen: (amount: number) => void;
  pending: boolean;
  error: string | null;
}) {
  const [openingAmount, setOpeningAmount] = useState('');
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
          if (hasOpening) onOpen(opening);
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
            disabled={!hasOpening || pending}
            data-testid="cash-open"
            className="cash-btn-open"
          >
            {pending ? 'Abriendo…' : 'Abrir caja'}
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

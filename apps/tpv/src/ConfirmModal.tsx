interface ConfirmModalProps {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}

// Diálogo de confirmación genérico para el TPV. Reutiliza el overlay y los
// botones de PaymentModal para mantener coherencia visual (tokens --ui-*).
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  busy = false,
  onConfirm,
  onCancel,
  testId,
}: ConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      {...(testId ? { 'data-testid': `${testId}-modal` } : {})}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-[var(--ui-radius-xl)] border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-[0_6px_22px_-10px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2 px-5 pt-5 pb-1">
          <h2 className="text-base font-semibold text-[var(--ui-text)]">{title}</h2>
          {message && <p className="text-sm text-[var(--ui-text-muted)]">{message}</p>}
        </div>

        <div className="flex gap-2 p-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            {...(testId ? { 'data-testid': `${testId}-cancel` } : {})}
            className="h-12 flex-1 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] text-sm font-medium text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-subtle)] active:translate-y-[0.5px] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            {...(testId ? { 'data-testid': `${testId}-confirm` } : {})}
            className="h-12 flex-1 rounded-full bg-[var(--ui-primary)] text-sm font-semibold text-[var(--ui-primary-fg)] transition-colors hover:bg-[var(--ui-primary-hover)] active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Fichando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

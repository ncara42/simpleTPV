import { Check, Trash2, X } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';

import { Modal } from './Modal.js';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Acción destructiva → botón de confirmación en rojo.
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm {
  opts: ConfirmOptions;
  resolve: (result: boolean) => void;
}

// Proveedor de diálogos de confirmación. Sustituye a window.confirm por un modal
// del design system (accesible, cierra con Escape). Uso: `if (await confirm({...}))`.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setPending({ opts, resolve })),
    [],
  );

  const close = (result: boolean): void => {
    pending?.resolve(result);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Modal
          onClose={() => close(false)}
          className="modal--form modal--confirm"
          testId="confirm-dialog"
          ariaLabel={pending.opts.title ?? 'Confirmar'}
        >
          <header className="modal-head">
            <h3>{pending.opts.title ?? 'Confirmar'}</h3>
          </header>
          <div className="modal-body">
            <p>{pending.opts.message}</p>
          </div>
          <div className="modal-foot modal-foot-actions">
            <button type="button" onClick={() => close(false)} data-testid="confirm-cancel">
              <X size={16} aria-hidden="true" />
              {pending.opts.cancelLabel ?? 'Cancelar'}
            </button>
            <button
              type="button"
              className={pending.opts.danger ? 'btn-danger' : 'btn-primary'}
              onClick={() => close(true)}
              data-testid="confirm-accept"
            >
              {pending.opts.danger ? (
                <Trash2 size={16} aria-hidden="true" />
              ) : (
                <Check size={16} aria-hidden="true" />
              )}
              {pending.opts.confirmLabel ?? 'Aceptar'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

// Devuelve la función de confirmación. Lanza si se usa fuera del ConfirmProvider.
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>');
  return ctx;
}

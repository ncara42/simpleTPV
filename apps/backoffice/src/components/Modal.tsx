import { type FormEventHandler, type MouseEvent, type ReactNode, useEffect } from 'react';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  // Clases extra para el panel (se añaden a `modal`), p.ej. 'modal--form user-form'.
  className?: string;
  testId?: string;
  // Si se pasa, el panel se renderiza como <form> (con su onSubmit); si no, como <div>.
  onSubmit?: FormEventHandler<HTMLFormElement>;
  labelledBy?: string;
}

// Modal reutilizable del backoffice: encapsula el backdrop (cierre al click-outside),
// el cierre con Escape y el stopPropagation del panel — patrón antes duplicado en
// ~15 páginas. Mantiene las clases `modal-backdrop`/`modal` de catalog.css, así que
// el DOM resultante (y los data-testid de cada página) no cambian.
export function Modal({ onClose, children, className, testId, onSubmit, labelledBy }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const panelClass = className ? `modal ${className}` : 'modal';
  const stop = (e: MouseEvent): void => e.stopPropagation();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {onSubmit ? (
        <form
          className={panelClass}
          onClick={stop}
          onSubmit={onSubmit}
          data-testid={testId}
          aria-labelledby={labelledBy}
        >
          {children}
        </form>
      ) : (
        <div
          className={panelClass}
          onClick={stop}
          data-testid={testId}
          aria-labelledby={labelledBy}
        >
          {children}
        </div>
      )}
    </div>
  );
}

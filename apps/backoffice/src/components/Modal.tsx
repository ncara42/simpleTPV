import {
  type FormEventHandler,
  type MouseEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
} from 'react';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  // Clases extra para el panel (se añaden a `modal`), p.ej. 'modal--form user-form'.
  className?: string;
  testId?: string;
  // Si se pasa, el panel se renderiza como <form> (con su onSubmit); si no, como <div>.
  onSubmit?: FormEventHandler<HTMLFormElement>;
  labelledBy?: string;
  ariaLabel?: string;
}

// Elementos que pueden recibir foco dentro del modal (para el foco inicial y el trap).
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modal reutilizable del backoffice: encapsula el backdrop (cierre al click-outside),
// el cierre con Escape, el stopPropagation del panel y la accesibilidad de diálogo
// (role/aria-modal, foco inicial, focus-trap y restauración del foco al cerrar).
// Mantiene las clases `modal-backdrop`/`modal` de catalog.css, así que el DOM
// resultante (y los data-testid de cada página) no cambian.
export function Modal({
  onClose,
  children,
  className,
  testId,
  onSubmit,
  labelledBy,
  ariaLabel,
}: ModalProps) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Guarda el elemento que tenía el foco para restaurarlo al cerrar.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    // Foco inicial: respeta un autoFocus ya aplicado dentro del panel; si no hay
    // nada enfocado dentro, enfoca el primer elemento focusable (o el panel).
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Focus-trap: Tab/Shift+Tab ciclan dentro del panel.
      if (e.key === 'Tab' && panel) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const panelClass = className ? `modal ${className}` : 'modal';
  const stop = (e: MouseEvent): void => e.stopPropagation();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {onSubmit ? (
        <form
          ref={panelRef as Ref<HTMLFormElement>}
          className={panelClass}
          onClick={stop}
          onSubmit={onSubmit}
          data-testid={testId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-label={ariaLabel}
          tabIndex={-1}
        >
          {children}
        </form>
      ) : (
        <div
          ref={panelRef as Ref<HTMLDivElement>}
          className={panelClass}
          onClick={stop}
          data-testid={testId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-label={ariaLabel}
          tabIndex={-1}
        >
          {children}
        </div>
      )}
    </div>
  );
}

import { useEffect } from 'react';

export type AlertVariant = 'success' | 'danger' | 'warning';

export interface AlertProps {
  /** Acento de color del toast. Por defecto 'success'. */
  variant?: AlertVariant;
  /** Cuerpo del aviso. Se apila en columna, así que admite una o varias líneas
   * (p. ej. `<strong>` de título + `<span>` de detalle). */
  children: React.ReactNode;
  /** Si se indica, se muestra el botón × y también lo invoca el auto-cierre. */
  onClose?: () => void;
  /** Milisegundos hasta el auto-cierre (llama a `onClose`). Sin valor, no se cierra solo. */
  duration?: number;
  /** Icono del círculo de acento. Por defecto una marca de texto según la variante. */
  icon?: React.ReactNode;
  /** aria-label del botón de cierre. */
  closeLabel?: string;
  /** data-testid del botón de cierre (para conservar testids existentes). */
  closeTestId?: string;
  /** Rol ARIA. 'status' (por defecto) para avisos no urgentes, 'alert' para errores. */
  role?: 'status' | 'alert';
  className?: string;
  'data-testid'?: string;
}

const DEFAULT_MARK: Record<AlertVariant, string> = {
  success: '✓',
  danger: '!',
  warning: '!',
};

/**
 * Toast flotante fijo en la esquina inferior derecha. Sin Tailwind (clases
 * planas + `alert.css`) para que renderice con estilo también en apps/tpv.
 * Opcionalmente se auto-cierra pasados `duration` ms.
 */
export function Alert({
  variant = 'success',
  children,
  onClose,
  duration,
  icon,
  closeLabel = 'Cerrar',
  closeTestId,
  role = 'status',
  className,
  'data-testid': testid,
}: AlertProps) {
  useEffect(() => {
    if (!duration || !onClose) return;
    const id = setTimeout(onClose, duration);
    return () => clearTimeout(id);
  }, [duration, onClose]);

  return (
    <div
      className={`ui-alert ui-alert--${variant}${className ? ` ${className}` : ''}`}
      role={role}
      data-testid={testid}
    >
      <span className="ui-alert__icon" aria-hidden="true">
        {icon ?? DEFAULT_MARK[variant]}
      </span>
      <div className="ui-alert__body">{children}</div>
      {onClose && (
        <button
          type="button"
          className="ui-alert__close"
          onClick={onClose}
          aria-label={closeLabel}
          data-testid={closeTestId}
        >
          ×
        </button>
      )}
    </div>
  );
}

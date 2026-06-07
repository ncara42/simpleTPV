import { type ReactNode } from 'react';

interface SectionToolbarProps {
  // Lado izquierdo: contador, filtros, etc.
  children?: ReactNode;
  // Acción primaria a la derecha (botón). Si se omite, no se renderiza.
  actionLabel?: string;
  onAction?: () => void;
  actionTestId?: string;
}

// Barra superior de sección (contador/filtros a la izquierda + acción primaria a
// la derecha), antes duplicada en las secciones de B2B y API Keys. Mantiene las
// clases users-toolbar/sales-filters/btn-primary de catalog.css.
export function SectionToolbar({
  children,
  actionLabel,
  onAction,
  actionTestId,
}: SectionToolbarProps) {
  return (
    <div className="users-toolbar">
      <div className="sales-filters">{children}</div>
      {actionLabel && (
        <button className="btn-primary" onClick={onAction} data-testid={actionTestId}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

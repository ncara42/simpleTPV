import { Button } from '@simpletpv/ui';
import { type ReactNode } from 'react';

interface SectionToolbarProps {
  // Lado izquierdo: contador, filtros, etc.
  children?: ReactNode;
  // Acción primaria a la derecha (botón). Si se omite, no se renderiza.
  actionLabel?: string;
  onAction?: () => void;
  actionTestId?: string;
  // Icono opcional a la izquierda del label (patrón de tabla: CTA con icono).
  actionIcon?: ReactNode;
}

// Barra superior de sección (contador/filtros a la izquierda + acción primaria a
// la derecha), antes duplicada en las secciones de B2B y API Keys. Mantiene las
// clases users-toolbar/sales-filters de catalog.css; la acción usa el <Button>
// compartido (@simpletpv/ui) dentro de .ui-dt-toolbar-actions, igual que el
// patrón objetivo de UsersPage (filtros izquierda · CTA derecha).
export function SectionToolbar({
  children,
  actionLabel,
  onAction,
  actionTestId,
  actionIcon,
}: SectionToolbarProps) {
  return (
    <div className="users-toolbar">
      <div className="sales-filters">{children}</div>
      {actionLabel && (
        <div className="ui-dt-toolbar-actions">
          <Button onClick={onAction} data-testid={actionTestId} icon={actionIcon}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

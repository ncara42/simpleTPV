import * as React from 'react';

import { cn } from '../lib/cn.js';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'muted';

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        // Píldora de estado: patrón del design system (fondo -soft + texto ink),
        // alineada con .status-badge del backoffice. Colores por token, sin borde.
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        variant === 'default' && 'bg-[var(--ui-surface-subtle)] text-[var(--ui-text)]',
        variant === 'success' && 'bg-[var(--ui-success-soft)] text-[var(--ui-success)]',
        variant === 'warning' && 'bg-[var(--ui-warning-soft)] text-[var(--ui-warning)]',
        variant === 'danger' && 'bg-[var(--ui-danger-soft)] text-[var(--ui-danger)]',
        variant === 'muted' && 'bg-[var(--ui-surface-subtle)] text-[var(--ui-text-muted)]',
        className,
      )}
      {...props}
    />
  );
}

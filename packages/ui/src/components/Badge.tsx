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
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        variant === 'default' &&
          'border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] text-[var(--ui-text)]',
        variant === 'success' && 'border-green-200 bg-green-50 text-green-700',
        variant === 'warning' && 'border-amber-200 bg-amber-50 text-amber-700',
        variant === 'danger' && 'border-red-200 bg-red-50 text-red-700',
        variant === 'muted' &&
          'border-transparent bg-[var(--ui-surface-subtle)] text-[var(--ui-text-muted)]',
        className,
      )}
      {...props}
    />
  );
}

import * as React from 'react';

import { cn } from '../lib/cn.js';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'default';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--ui-radius-sm)] border text-sm font-medium whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-9 px-4',
        size === 'lg' && 'h-11 px-5 text-base',
        (variant === 'primary' || variant === 'default') &&
          'border-[var(--ui-primary)] bg-[var(--ui-primary)] text-[var(--ui-primary-fg)] hover:bg-[var(--ui-primary-hover)] active:bg-[var(--ui-primary-hover)]',
        variant === 'secondary' &&
          'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text)] hover:bg-[var(--ui-surface-subtle)]',
        variant === 'ghost' &&
          'border-transparent bg-transparent text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-subtle)] hover:text-[var(--ui-text)]',
        variant === 'danger' &&
          'border-[var(--ui-danger)] bg-[var(--ui-danger)] text-white hover:opacity-90 active:opacity-100',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

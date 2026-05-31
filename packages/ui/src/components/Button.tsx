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
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--ui-radius-sm)] border text-sm font-medium transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-9 px-4',
        size === 'lg' && 'h-11 px-5 text-base',
        (variant === 'primary' || variant === 'default') &&
          'border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 active:bg-neutral-950',
        variant === 'secondary' &&
          'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text)] hover:bg-[var(--ui-surface-subtle)]',
        variant === 'ghost' &&
          'border-transparent bg-transparent text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-subtle)] hover:text-[var(--ui-text)]',
        variant === 'danger' &&
          'border-red-600 bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

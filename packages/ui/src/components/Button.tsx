import * as React from 'react';

import { cn } from '../lib/cn.js';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'default';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * U-14: icono a la izquierda del texto. Pasar el componente de lucide ya
   * dimensionado (size 16). El hueco/alineación los pone el propio Button — los
   * CTAs no componen el icono a mano. Ver DESIGN_SYSTEM §11 (mapa acción→icono).
   */
  icon?: React.ReactNode;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', icon, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        // U-16: forma pill, alineada con la convención de CTAs del design system
        // (DESIGN_SYSTEM §10), para que Button sea un drop-in de los .btn-primary.
        // `ui-btn` es el gancho estable del design system: permite que el CSS de
        // cada app distinga este componente de los <button> crudos (p. ej. para no
        // pisar su estilo con selectores amplios como `.modal-foot button`).
        'ui-btn inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border text-sm font-medium whitespace-nowrap transition select-none active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0',
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
    >
      {icon != null && (
        <span className="inline-flex shrink-0 items-center" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

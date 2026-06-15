import * as React from 'react';

import { cn } from '../lib/cn.js';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      // `ui-input`: gancho estable del design system (igual que `ui-btn` en Button).
      // Reproduce la píldora de formulario del backoffice (.modal input) para que la
      // migración a <Input> no cambie el aspecto: alto 2.6rem, hairline fuerte,
      // radio 10px y foco azul Apple.
      'ui-input h-[2.6rem] w-full rounded-[10px] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-[0.8rem] text-[0.95rem] font-normal tracking-[-0.012em] text-[var(--ui-text)] outline-none transition-[border-color,box-shadow] duration-100 placeholder:text-[var(--ui-text-soft)] focus:border-[var(--ap-blue-focus)] focus:shadow-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

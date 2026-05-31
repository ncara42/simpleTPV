import * as React from 'react';

import { cn } from '../lib/cn.js';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-9 w-full rounded-[var(--ui-radius-sm)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] outline-none transition-colors placeholder:text-[var(--ui-text-soft)] focus:border-neutral-400 focus:shadow-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

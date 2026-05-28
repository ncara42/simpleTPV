import * as React from 'react';

import { cn } from '../lib/cn.js';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost';
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex h-10 items-center rounded-md px-4 text-sm font-medium transition',
        variant === 'default' && 'bg-brand text-brand-foreground hover:opacity-90',
        variant === 'ghost' && 'bg-transparent hover:bg-gray-100',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

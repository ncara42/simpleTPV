import type { ReactNode } from 'react';

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--ui-radius)] border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-8 text-center">
      <p className="text-sm font-medium text-[var(--ui-text)]">{title}</p>
      {children && <div className="mt-1 text-sm text-[var(--ui-text-muted)]">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

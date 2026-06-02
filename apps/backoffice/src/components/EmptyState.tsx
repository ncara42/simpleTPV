import type { ReactNode } from 'react';

interface Props {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  testid?: string;
}

// Estado vacío explicativo: en vez de "Sin datos", dice qué es y qué hacer.
// Clave para que alguien nuevo entienda la herramienta sin formación.
export function EmptyState({ title, description, action, icon, testid }: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-16 text-center"
      data-testid={testid}
    >
      {icon && (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

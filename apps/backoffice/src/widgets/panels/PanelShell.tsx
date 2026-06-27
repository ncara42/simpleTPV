import type { ReactNode } from 'react';

// Envoltorio común de los widgets de panel del rediseño: aplica el chrome `.dash-panel` (cabecera
// opcional) y un cuerpo `.dash-widget-body`. Con `fill` el cuerpo crece para llenar el tile (rejillas,
// áreas, sparklines a sangre); sin `fill` ocupa su alto natural (cifras, donuts). Sustituye al antiguo
// GeistPanel.
export function PanelShell({
  id,
  title,
  subtitle,
  fill = false,
  children,
}: {
  id: string;
  title?: string;
  subtitle?: string;
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`dash-panel${fill ? ' dash-panel--fill' : ''}`} data-testid={id}>
      {title ? (
        <header className="dash-panel-head">
          <div className="dash-panel-titles">
            <h3>{title}</h3>
            {subtitle ? <p className="dash-panel-sub">{subtitle}</p> : null}
          </div>
        </header>
      ) : null}
      <div className="dash-widget-body">{children}</div>
    </div>
  );
}

import type { ReactNode } from 'react';

// Cómo ocupa el contenido el tile (contrato responsivo del rediseño, plan 2026-06-29):
//  - 'stretch' (default): el contenido CRECE para llenar el tile (rejillas, listas, tablas, gráficas).
//  - 'center': figura de tamaño intrínseco CENTRADA; el espacio sobrante = aire equilibrado, no banda
//    blanca adherida (cifras KPI, donut, gauge, badge, hero).
//  - 'natural': alto de contenido, centrado en vertical (caso raro).
export type PanelFit = 'stretch' | 'center' | 'natural';

// Envoltorio común de los widgets de panel del rediseño: aplica el chrome `.dash-panel` (cabecera
// opcional) y un cuerpo `.dash-widget-body` que SIEMPRE llena el tile; `fit` decide cómo se comporta su
// contenido dentro. Sustituye al antiguo GeistPanel.
export function PanelShell({
  id,
  title,
  subtitle,
  fit,
  fill = false,
  bare = false,
  children,
}: {
  id: string;
  title?: string;
  subtitle?: string;
  /** Modo de relleno responsivo. Default 'stretch'. */
  fit?: PanelFit;
  /** @deprecated alias de `fit="stretch"`; se mantiene para reglas heredadas. */
  fill?: boolean;
  /** Sin chrome: quita padding/borde/fondo/radio del tile (widgets a sangre o con tarjeta propia). */
  bare?: boolean;
  children: ReactNode;
}) {
  // Migración por fases: sin `fit` explícito, los que pasaban `fill` siguen en stretch y el resto cae a
  // 'natural' (centrado vertical: elimina la banda blanca sin estirar/distorsionar lo aún no migrado).
  const effFit: PanelFit = fit ?? (fill ? 'stretch' : 'natural');
  const className = [
    'dash-panel',
    `dash-panel--fit-${effFit}`,
    // Alias heredado: algunas reglas viejas cuelgan de `.dash-panel--fill` (p. ej. el gráfico horario).
    effFit === 'stretch' ? 'dash-panel--fill' : '',
    bare ? 'dash-panel--bare' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} data-testid={id}>
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

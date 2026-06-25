import { useEffect, useState } from 'react';

import { api } from '../lib/auth.js';
import type { DashboardPeriod } from '../lib/dashboard.js';
import { GeistWidget } from '../widgets/geist/geistWidgets.js';
import { GEIST_WIDGET_IDS, GEIST_WIDGET_META } from '../widgets/geist/meta.js';

// Vista previa de diseño de los 16 widgets Geist con datos REALES. Auto-login (demo) y selector de
// periodo. Cada widget va en una celda dimensionada a su tamaño de rejilla, sobre el lienzo oscuro.

const PERIODS: DashboardPeriod[] = ['today', 'week', 'month', 'year'];
const PERIOD_LABEL: Record<DashboardPeriod, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  week: 'Semana',
  month: 'Mes',
  year: 'Año',
};

// Alto en px de una celda según sus filas de rejilla (≈160px/fila como el lienzo).
const ROW_PX = 156;

export function GeistPreview() {
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod>('today');

  useEffect(() => {
    api
      .login('admin@demo.simpletpv', 'demo1234')
      .then(() => setAuthed(true))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <div className="gp-status gp-status--error" data-testid="gp-error">
        Login falló: {error}
      </div>
    );
  }
  if (!authed) {
    return (
      <div className="gp-status" data-testid="gp-loading">
        Iniciando sesión…
      </div>
    );
  }

  return (
    <div className="geist-preview" data-testid="gp-ready">
      <header className="gp-bar">
        <div className="gp-title">
          Widgets Geist · vista previa
          <span className="gp-sub">datos reales · {GEIST_WIDGET_IDS.length} widgets</span>
        </div>
        <div className="gp-periods" role="group" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              data-testid={`period-${p}`}
              className={p === period ? 'is-active' : ''}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </header>

      <main className="gp-grid">
        {GEIST_WIDGET_IDS.map((id) => {
          const meta = GEIST_WIDGET_META[id]!;
          return (
            <section
              key={id}
              className="gp-cell"
              style={{ gridColumn: `span ${meta.size.w}` }}
              data-preview={id}
            >
              <div className="gp-cell-label">{id}</div>
              <div
                className="gp-cell-body"
                style={{ height: `${meta.size.h * ROW_PX}px` }}
                data-testid={`cell-${id}`}
              >
                {/* `key` por periodo: re-monta al cambiar de periodo (evita estados intermedios). */}
                <GeistWidget key={`${id}:${period}`} id={id} period={period} />
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}

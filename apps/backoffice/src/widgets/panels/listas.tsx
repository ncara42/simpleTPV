import './listas.css';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ReactElement, useState } from 'react';

import { getProductRankings, getSalesByFamily } from '../../lib/dashboard.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';
import { useFitCount } from './useFitCount.js';

// Alto aprox. de una fila (cabecera + barra) para el conteo adaptativo de filas según la altura del tile.
const LIST_ROW_H = 36;

const EUR0 = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
// Porcentaje con 1 decimal y coma, sin espacio antes del % (como el handoff: «18,5%»). Recibe 0–100.
const pct1 = (x: number): string => `${x.toFixed(1).replace('.', ',')}%`;

// Sección 03 · «Ventas por familia» — fila por familia con chip de puesto, cifra, cuota y barra
// proporcional al líder. Comparte el queryKey 'dash-family' con «Mix de ventas» → caché compartida.

export function FamilyShare({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-family', period, store],
    queryFn: () => getSalesByFamily(period, store),
    placeholderData: keepPreviousData,
  });
  const all = q.data ?? [];
  const total = all.reduce((s, f) => s + f.total, 0);
  const sorted = [...all].sort((a, b) => b.total - a.total);
  // Nº de familias visibles ADAPTADO a la altura del tile (más en tiles altos, menos en bajos).
  const { ref, count } = useFitCount(LIST_ROW_H, { gap: 14, min: 3, max: sorted.length || 1 });
  const fams = sorted.slice(0, count);
  const maxTotal = Math.max(1, ...fams.map((f) => f.total));

  return (
    <PanelShell id="lista-familia" fit="stretch" bare>
      <div className="lc-card">
        <h3 className="lc-title">Ventas por familia</h3>
        <div className="fam-list" ref={ref}>
          {fams.map((f, i) => (
            <div key={f.familyId ?? f.familyName}>
              <div className="fam-head">
                <span className={`fam-rank${i === 0 ? ' fam-rank--lead' : ''}`}>{i + 1}</span>
                <span className="fam-name">{f.familyName}</span>
                <span className="fam-value">{EUR0.format(f.total)}</span>
                <span className="fam-share">{pct1(total > 0 ? (f.total / total) * 100 : 0)}</span>
              </div>
              <span className="fam-track">
                <span className="fam-fill" style={{ width: `${(f.total / maxTotal) * 100}%` }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

// Sección 03 · «Rankings» — top de productos con pestañas (ventas/margen/rotación); fila con barra fina
// proporcional. Top ventas/margen en €, peor rotación en unidades.
type RankTab = 'sales' | 'margin' | 'rotation';
const RANK_TABS: ReadonlyArray<{ key: RankTab; label: string }> = [
  { key: 'sales', label: 'Top ventas' },
  { key: 'margin', label: 'Top margen' },
  { key: 'rotation', label: 'Peor rotación' },
];

interface RankRow {
  id: string;
  name: string;
  value: number;
  display: string;
}

export function ProductRanking({ period, store }: PanelProps): ReactElement {
  const [tab, setTab] = useState<RankTab>('sales');
  const q = useQuery({
    queryKey: ['dash-rankings', period, store],
    queryFn: () => getProductRankings(period, store),
    placeholderData: keepPreviousData,
  });
  const d = q.data;

  const allRows: RankRow[] =
    tab === 'sales'
      ? (d?.topSales ?? []).map((p) => ({
          id: p.productId,
          name: p.name,
          value: p.total,
          display: EUR0.format(p.total),
        }))
      : tab === 'margin'
        ? (d?.topMargin ?? []).map((p) => ({
            id: p.productId,
            name: p.name,
            value: p.margin,
            display: EUR0.format(p.margin),
          }))
        : (d?.worstRotation ?? []).map((p) => ({
            id: p.productId,
            name: p.name,
            value: p.units,
            display: `${p.units} uds`,
          }));
  // Nº de filas del ranking ADAPTADO a la altura del tile.
  const { ref, count } = useFitCount(LIST_ROW_H, { gap: 13, min: 3, max: allRows.length || 1 });
  const rows = allRows.slice(0, count);
  const maxV = Math.max(1, ...rows.map((r) => r.value));

  return (
    <PanelShell id="lista-rankings" fit="stretch" bare>
      <div className="lc-card">
        <div className="rk-head">
          <h3 className="lc-title">Rankings</h3>
        </div>
        <div className="rk-tabs" role="tablist" aria-label="Métrica del ranking">
          {RANK_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className="rk-tab"
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="rk-list" ref={ref}>
          {rows.map((r, i) => (
            <div key={r.id}>
              <div className="rk-head-row">
                <span className={`rk-rank${i === 0 ? ' rk-rank--lead' : ''}`}>{i + 1}</span>
                <span className="rk-name">{r.name}</span>
                <span className="rk-value">{r.display}</span>
              </div>
              <span className="rk-bar" style={{ width: `${(r.value / maxV) * 100}%` }} />
            </div>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

// Sección 03 · «Mix de ventas» (ALT) — barra apilada MONOCROMA (rampa azul, no arcoíris) + leyenda.
// Mismo reparto que «Ventas por familia». Barra = top 5 familias + resto; leyenda = top 4 + «Otras».
const MIX_BAR_TOP = 5;
const MIX_LEGEND_TOP = 4;
const MIX_PCTS = [100, 80, 62, 46, 32, 16] as const; // pasos del azul monocromo (acento → casi blanco)
const mixBlue = (i: number): string => {
  const p = MIX_PCTS[Math.min(i, MIX_PCTS.length - 1)];
  return `color-mix(in oklab, var(--ui-brand) ${p}%, var(--ui-surface))`;
};

export function SalesMix({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-family', period, store],
    queryFn: () => getSalesByFamily(period, store),
    placeholderData: keepPreviousData,
  });
  const fams = [...(q.data ?? [])].sort((a, b) => b.total - a.total);
  const total = fams.reduce((s, f) => s + f.total, 0);
  const share = (v: number): number => (total > 0 ? (v / total) * 100 : 0);

  const barTop = fams.slice(0, MIX_BAR_TOP);
  const barRest = Math.max(0, 100 - barTop.reduce((s, f) => s + share(f.total), 0));
  const legTop = fams.slice(0, MIX_LEGEND_TOP);
  const legRest = Math.max(0, 100 - legTop.reduce((s, f) => s + share(f.total), 0));

  return (
    <PanelShell id="lista-mix" fit="stretch" bare>
      <div className="lc-card">
        <h3 className="lc-title">Mix de ventas</h3>
        <div className="mix-bar" role="img" aria-label="Reparto de ventas por familia">
          {barTop.map((f, i) => (
            <span
              key={f.familyId ?? f.familyName}
              style={{ width: `${share(f.total)}%`, background: mixBlue(i) }}
            />
          ))}
          {barRest > 0.1 ? <span style={{ width: `${barRest}%`, background: mixBlue(5) }} /> : null}
        </div>
        <div className="mix-legend">
          {legTop.map((f, i) => (
            <div className="mix-leg-row" key={f.familyId ?? f.familyName}>
              <span className="mix-dot" style={{ background: mixBlue(i) }} />
              <span className="mix-leg-name">{f.familyName}</span>
              <span className="mix-leg-val">{pct1(share(f.total))}</span>
            </div>
          ))}
          <div className="mix-leg-row">
            <span className="mix-dot" style={{ background: mixBlue(5) }} />
            <span className="mix-leg-name mix-leg-name--muted">Otras familias</span>
            <span className="mix-leg-val mix-leg-val--muted">{pct1(legRest)}</span>
          </div>
        </div>
      </div>
    </PanelShell>
  );
}

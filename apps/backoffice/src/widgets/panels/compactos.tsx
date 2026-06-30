import './compactos.css';

import { DonutStat, HeroFigure, KpiGrid, RibbonStat, SparkArea } from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import {
  getMarginKpis,
  getSalesByEmployee,
  getSalesByFamily,
  getSalesKpis,
} from '../../lib/dashboard.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';
import { useFitCount } from './useFitCount.js';

// Formato es-ES: euros sin decimales (con separador de miles) y porcentaje con 1 decimal.
const nfTmEur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  useGrouping: 'always',
});
const nfTmPct = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// Sección 05 · Banda compacta (RibbonStat × 3): facturación, tickets y ticket medio (con mini-área).
export function CompactRibbon({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-sales-kpis', period, store],
    queryFn: () => getSalesKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const s = q.data;
  const avg = s?.series?.avgTicket;

  return (
    <PanelShell id="cmp-ribbon" fill bare>
      <KpiGrid columns={1} bleed>
        <RibbonStat label="Facturación" value={s?.revenue ?? null} format="eur0" />
        <RibbonStat label="Tickets" value={s?.salesCount ?? null} format="integer" />
        <RibbonStat
          label="Ticket medio"
          value={s?.avgTicket ?? null}
          format="eur"
          {...(avg && avg.length >= 2 ? { aside: <SparkArea data={avg} height={28} /> } : {})}
        />
      </KpiGrid>
    </PanelShell>
  );
}

// Sección 05 · Donut de reparto por familia (DonutStat): anillo mono + total al centro + leyenda.
export function CompactDonut({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-family', period, store],
    queryFn: () => getSalesByFamily(period, store),
    placeholderData: keepPreviousData,
  });
  const data = q.data ?? [];
  const items = data.map((f) => ({ label: f.familyName, value: f.total }));

  return (
    <PanelShell id="cmp-donut" fill>
      <DonutStat
        items={items}
        format="eur0"
        centerCaption={`${data.length} familias`}
        isLoading={q.isLoading}
        isError={q.isError}
      />
    </PanelShell>
  );
}

// Sección 05 · Treemap «Mix por familia» — RÉPLICA A MEDIDA del handoff «Fundación Geist» (no la molécula
// genérica): tarjeta plana + treemap de 2 filas con área ∝ facturación. Rampa azul descendente por rango
// (mezcla del acento con la superficie) y tinta blanca en los tonos oscuros / azul muy oscuro en los
// claros. Los tiles grandes muestran «valor € · %»; los pequeños solo «%» (como el handoff, sin truncar).
const TM_RANK_MIX = [100, 85, 70, 48, 33, 22, 13, 10]; // % de --ui-brand por puesto (desc)
const TM_TOP = 6; // familias mostradas; el resto se agrega en «Otras familias»
const TM_VALUE_MIN_PCT = 10; // umbral para mostrar el valor € además del %

function tmMix(rank: number): number {
  return TM_RANK_MIX[Math.min(rank, TM_RANK_MIX.length - 1)] ?? 12;
}
function tmBg(rank: number): string {
  return `color-mix(in oklab, var(--ui-brand) ${tmMix(rank)}%, var(--ui-surface))`;
}
function tmInk(rank: number): string {
  // Fondos oscuros (acento dominante) → tinta blanca; claros → azul muy oscuro (handoff #0d3a73).
  return tmMix(rank) >= 60
    ? 'var(--ui-primary-fg)'
    : 'color-mix(in oklab, var(--ui-brand) 55%, var(--ui-text))';
}

interface TmTile {
  label: string;
  value: number;
  pct: number;
  rank: number;
}

export function CompactTreemap({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-family', period, store],
    queryFn: () => getSalesByFamily(period, store),
    placeholderData: keepPreviousData,
  });
  const data = [...(q.data ?? [])].filter((f) => f.total > 0).sort((a, b) => b.total - a.total);
  const total = data.reduce((s, f) => s + f.total, 0) || 1;

  // Top N familias + cola agregada en «Otras familias» (réplica del handoff). pct sobre el total real.
  const head = data.slice(0, TM_TOP).map((f) => ({ label: f.familyName, value: f.total }));
  const tailTotal = data.slice(TM_TOP).reduce((s, f) => s + f.total, 0);
  const base = tailTotal > 0 ? [...head, { label: 'Otras familias', value: tailTotal }] : head;
  const tiles: TmTile[] = base.map((t, rank) => ({ ...t, rank, pct: (t.value / total) * 100 }));

  // Partición en 2 filas: la primera acumula los mayores hasta cruzar ~50% del área; el resto, abajo.
  // El flexGrow de cada fila = su cuota → alturas proporcionales; dentro de la fila, ancho ∝ valor.
  let rows: TmTile[][];
  if (tiles.length <= 3) {
    rows = tiles.length ? [tiles] : [];
  } else {
    let acc = 0;
    let split = 1;
    for (let i = 0; i < tiles.length; i++) {
      acc += tiles[i]!.pct;
      if (acc >= 50) {
        split = i + 1;
        break;
      }
    }
    split = Math.max(1, Math.min(split, tiles.length - 1));
    rows = [tiles.slice(0, split), tiles.slice(split)];
  }

  return (
    <PanelShell id="cmp-treemap" fit="stretch" bare>
      <div className="ct-card">
        <h3 className="ct-title">Mix por familia</h3>
        <div className="ct-grid" role="img" aria-label="Reparto de la facturación por familia">
          {rows.map((row, r) => (
            <div
              className="ct-row"
              key={r}
              style={{ flexGrow: row.reduce((s, t) => s + t.pct, 0) }}
            >
              {row.map((t) => (
                <div
                  className="ct-tile"
                  key={t.label}
                  style={{ flexGrow: t.pct, background: tmBg(t.rank), color: tmInk(t.rank) }}
                  title={`${t.label}: ${nfTmEur.format(t.value)} · ${nfTmPct.format(t.pct)}%`}
                >
                  <span className="ct-name">{t.label}</span>
                  <span className="ct-note">
                    {t.pct >= TM_VALUE_MIN_PCT ? `${nfTmEur.format(t.value)} · ` : ''}
                    {nfTmPct.format(t.pct)}%
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

// Sección 05 · «Top vendedores» — lista de ranking a medida (réplica del lenguaje del handoff, pero en
// vertical para tile estrecho): fila = puesto + nombre + facturación + barra proporcional + tickets. El
// nº de filas se ADAPTA a la altura del tile (`useFitCount`): más vendedores en tiles altos, menos en
// bajos, sin filas a medias. El nº1 lleva chip azul; el resto, chip neutro.
const LB_ROW_H = 44; // alto aprox. de una fila (2 líneas) — calibra el conteo adaptativo
const LB_GAP = 14; // gap entre filas (= `.lb-list` gap)

export function CompactLeaderboard({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-sales-emp', period, store],
    queryFn: () => getSalesByEmployee(period, store),
    placeholderData: keepPreviousData,
  });
  const ranked = [...(q.data ?? [])]
    .filter((e) => Number.isFinite(e.total))
    .sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...ranked.map((e) => e.total));
  const { ref, count } = useFitCount(LB_ROW_H, { gap: LB_GAP, min: 3, max: ranked.length || 1 });
  const rows = ranked.slice(0, count);

  return (
    <PanelShell id="cmp-leaderboard" fit="stretch" bare>
      <div className="lb-card">
        <div className="lb-head">
          <h3 className="lb-title">Top vendedores</h3>
        </div>
        <div className="lb-list" ref={ref}>
          {rows.map((e, i) => {
            const rank = i + 1;
            const pct = Math.max((e.total / max) * 100, 4);
            return (
              <div className="lb-row" key={e.userId}>
                <span className={`lb-rank${rank === 1 ? ' lb-rank--top' : ''}`}>{rank}</span>
                <div className="lb-main">
                  <div className="lb-line">
                    <span className="lb-name">{e.userName}</span>
                    <span className="lb-value">{nfTmEur.format(e.total)}</span>
                  </div>
                  <div className="lb-foot">
                    <span className="lb-bar">
                      <span
                        className="lb-bar-fill"
                        style={{
                          width: `${pct}%`,
                          background:
                            rank <= 3
                              ? 'var(--ui-brand)'
                              : 'color-mix(in oklab, var(--ui-brand) 32%, var(--ui-surface))',
                        }}
                      />
                    </span>
                    <span className="lb-tickets">{e.salesCount} tickets</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PanelShell>
  );
}

// Sección 05 · Cifra-héroe (HeroFigure): la facturación del periodo en grande + chip de tickets y
// área de tendencia (serie de beneficio). Para destacar LA cifra del panel.
export function CompactHero({ period, store }: PanelProps): ReactElement {
  const sales = useQuery({
    queryKey: ['dash-sales-kpis', period, store],
    queryFn: () => getSalesKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const margin = useQuery({
    queryKey: ['dash-margin', period, store],
    queryFn: () => getMarginKpis(period, store),
    placeholderData: keepPreviousData,
  });
  const s = sales.data;
  const m = margin.data;

  return (
    <PanelShell id="cmp-hero" fill>
      <HeroFigure
        value={s?.revenue ?? null}
        format="eur"
        {...(s ? { chips: [{ text: `${s.salesCount} tickets` }] } : {})}
        {...(m?.realMarginSeries ? { spark: m.realMarginSeries } : {})}
      />
    </PanelShell>
  );
}

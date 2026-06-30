import './especializados.css';

import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { Fragment, type ReactElement, useState } from 'react';
import { createPortal } from 'react-dom';

import { listStores } from '../../lib/admin.js';
import {
  getMarginKpis,
  getSalesByHourOnDay,
  getSalesKpis,
  getSalesKpisRange,
  getSalesToday,
  getStockoutKpis,
} from '../../lib/dashboard.js';
import { compareSupplierPrices } from '../../lib/supplier-prices.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';

// ── Formato es-ES ────────────────────────────────────────────────────────────
const nfEur0 = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  useGrouping: 'always',
});
const nfEur2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const nfInt = new Intl.NumberFormat('es-ES');
// `marginPct` llega como fracción (0.598) → style:percent la lleva a «59,8 %».
const nfPct1 = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
// Variación MoM ya viene en puntos porcentuales → formato numérico + «%».
const nfNum1 = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const MAX_ROWS = 6;

function todayLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Pin de ubicación (stroke = currentColor; el tono lo pone el contenedor).
function PinIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"
        stroke="currentColor"
        strokeWidth={2}
      />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

// ── 1 · Comparativa de proveedores (mejor precio marcado) ────────────────────────────────────────
export function SupplierComparison(_props: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-supplier-compare'],
    queryFn: () => compareSupplierPrices(),
    placeholderData: keepPreviousData,
  });
  const rows = (q.data ?? []).filter((r) => r.best && r.prices.length > 1).slice(0, MAX_ROWS);

  return (
    <PanelShell id="esp-proveedores" fit="stretch" bare>
      <div className="sp-card">
        <div className="sp-title sp-title--gap">Comparativa de proveedores</div>
        {rows.map((r) => {
          const best = r.best!;
          // Competidor más cercano: el más barato entre los que no son el mejor.
          const other = r.prices
            .filter((p) => p.supplierId !== best.supplierId)
            .sort((a, b) => a.price - b.price)[0];
          return (
            <div className="sp-prov-row" key={r.productId}>
              <span className="sp-prov-name">{r.productName}</span>
              <span className="sp-badge sp-badge--best">
                {best.supplierName} {nfEur2.format(best.price)}
              </span>
              {other ? (
                <span className="sp-badge sp-badge--other">
                  {other.supplierName} {nfEur2.format(other.price)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

// ── 2 · Matriz tienda × franja (intensidad de ventas de hoy, POR HORAS auto-ajustable) ────────────
// Ventana por defecto (sin ventas aún): horario comercial 9–21. Con ventas, el rango se ciñe a la 1ª y
// última hora con actividad de cualquier tienda → columnas que se adaptan a la realidad, sin huecos muertos.
const MATRIX_DEFAULT_FROM = 9;
const MATRIX_DEFAULT_TO = 21;
function cellFill(t: number): string {
  const pct = Math.round(8 + Math.max(0, Math.min(1, t)) * 92);
  return `color-mix(in oklab, var(--ui-brand) ${pct}%, var(--ui-surface))`;
}

export function StoreBandMatrix({ store }: PanelProps): ReactElement {
  const day = todayLocalIso();
  const storesQ = useQuery({
    queryKey: ['dash-today', store],
    queryFn: () => getSalesToday(store),
    placeholderData: keepPreviousData,
  });
  const stores = (storesQ.data?.byStore ?? []).slice(0, 5);
  const hourQs = useQueries({
    queries: stores.map((s) => ({
      queryKey: ['dash-hour-day', day, s.storeId],
      queryFn: () => getSalesByHourOnDay(day, s.storeId),
      placeholderData: keepPreviousData,
    })),
  });

  // Bubble flotante con el nombre completo al pasar por una etiqueta de tienda truncada (portal a
  // <body> → no la recorta el overflow del tile). Solo aparece si el nombre está realmente truncado.
  const [tip, setTip] = useState<{ name: string; x: number; y: number } | null>(null);
  const showTip = (e: { currentTarget: HTMLSpanElement }, name: string): void => {
    const el = e.currentTarget;
    if (el.scrollWidth <= el.clientWidth) return;
    const r = el.getBoundingClientRect();
    setTip({ name, x: r.left + r.width / 2, y: r.top });
  };
  const hideTip = (): void => setTip(null);

  // Facturación por tienda × hora (0–23).
  const rows = stores.map((s, i) => {
    const byHour = new Array<number>(24).fill(0);
    for (const h of hourQs[i]?.data ?? []) byHour[h.hour] = (byHour[h.hour] ?? 0) + h.revenue;
    return { name: s.storeName, byHour };
  });

  // Rango activo: de la 1ª a la última hora con ventas (en cualquier tienda); sin ventas → ventana 9–21.
  let minH = 24;
  let maxH = -1;
  for (const r of rows) {
    for (let h = 0; h < 24; h++) {
      if (r.byHour[h]! > 0) {
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }
  }
  const fromH = maxH >= minH ? minH : MATRIX_DEFAULT_FROM;
  const toH = maxH >= minH ? maxH : MATRIX_DEFAULT_TO;
  const hours = Array.from({ length: toH - fromH + 1 }, (_, k) => fromH + k);
  const max = Math.max(1, ...rows.flatMap((r) => hours.map((h) => r.byHour[h]!)));

  return (
    <PanelShell id="esp-matriz" fit="stretch" bare>
      <div className="sp-card">
        <div className="sp-title sp-title--gap">Matriz tienda × franja</div>
        <div
          className="sp-matrix"
          style={{ gridTemplateColumns: `74px repeat(${hours.length}, minmax(0, 1fr))` }}
        >
          <span />
          {hours.map((h) => (
            <span key={h} className="sp-matrix-head">
              {h}
            </span>
          ))}
          {rows.map((r) => (
            <Fragment key={r.name}>
              <span
                className="sp-matrix-rowlabel"
                onMouseEnter={(e) => showTip(e, r.name)}
                onMouseLeave={hideTip}
              >
                {r.name}
              </span>
              {hours.map((h) => (
                <span
                  key={h}
                  className="sp-matrix-cell"
                  style={{ background: cellFill(r.byHour[h]! / max) }}
                />
              ))}
            </Fragment>
          ))}
        </div>
        {tip &&
          createPortal(
            <div className="sp-tip" style={{ left: `${tip.x}px`, top: `${tip.y}px` }}>
              {tip.name}
            </div>,
            document.body,
          )}
      </div>
    </PanelShell>
  );
}

// ── 3 · Tiendas (directorio con estado operativo) ────────────────────────────────────────────────
export function StoreDirectory(_props: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-stores'],
    queryFn: () => listStores(),
    placeholderData: keepPreviousData,
  });
  const stores = (q.data ?? []).filter((s) => s.active).slice(0, MAX_ROWS);

  return (
    <PanelShell id="esp-tiendas" fit="stretch" bare>
      <div className="sp-card">
        <div className="sp-title sp-title--gap">Tiendas</div>
        {stores.map((s) => {
          const ok = s.opsVerified && !s.opsIncident;
          const status = ok ? 'Operativa' : s.opsIncident ? 'Incidencia' : 'Sin verificar';
          return (
            <div className="sp-store-row" key={s.id}>
              <span className={`sp-store-pin sp-store-pin--${ok ? 'on' : 'off'}`}>
                <PinIcon />
              </span>
              <span className="sp-store-name">{s.address ?? s.name}</span>
              <span className={`sp-store-status sp-store-status--${ok ? 'on' : 'off'}`}>
                {status}
              </span>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

// ── 4 · Resumen ejecutivo (banner mensual con prosa + cifras clave) ───────────────────────────────
function Stat({
  val,
  lbl,
  tone,
}: {
  val: string;
  lbl: string;
  tone?: 'pos' | 'neg';
}): ReactElement {
  return (
    <div className="sp-exec-stat">
      <div className={`sp-exec-stat-val${tone ? ` sp-exec-stat-val--${tone}` : ''}`}>{val}</div>
      <div className="sp-exec-stat-lbl">{lbl}</div>
    </div>
  );
}

export function ExecutiveSummary(_props: PanelProps): ReactElement {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const iso = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const prevFrom = iso(new Date(y, m - 1, 1));
  const prevTo = iso(new Date(y, m - 1, d));
  const prevMonthName = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long' });

  const salesQ = useQuery({
    queryKey: ['dash-kpis', 'month'],
    queryFn: () => getSalesKpis('month'),
    placeholderData: keepPreviousData,
  });
  const marginQ = useQuery({
    queryKey: ['dash-margin', 'month'],
    queryFn: () => getMarginKpis('month'),
    placeholderData: keepPreviousData,
  });
  const stockQ = useQuery({
    queryKey: ['dash-stockout', 'month'],
    queryFn: () => getStockoutKpis('month'),
    placeholderData: keepPreviousData,
  });
  const prevQ = useQuery({
    queryKey: ['dash-kpis-range', prevFrom, prevTo],
    queryFn: () => getSalesKpisRange(prevFrom, prevTo),
    placeholderData: keepPreviousData,
  });

  const revenue = salesQ.data?.revenue ?? 0;
  const marginPct = marginQ.data?.marginPct ?? 0;
  const open = stockQ.data?.open ?? 0;
  const prevRev = prevQ.data?.revenue ?? 0;
  const deltaPct = prevRev > 0 ? ((revenue - prevRev) / prevRev) * 100 : null;
  const down = deltaPct !== null && deltaPct < 0;

  return (
    <PanelShell id="esp-resumen-ejecutivo" fit="stretch" bare>
      <div className="sp-card sp-exec">
        <div className="sp-exec-prose">
          <div className="sp-exec-text">
            El mes va a <strong>{nfEur0.format(revenue)}</strong> con un margen del{' '}
            <strong>{nfPct1.format(marginPct)}</strong>
            {deltaPct !== null ? (
              <>
                , con el ritmo diario {down ? 'cayendo' : 'subiendo'}{' '}
                <strong className={down ? 'sp-neg' : undefined}>
                  {nfNum1.format(Math.abs(deltaPct))}%
                </strong>{' '}
                frente a {prevMonthName}
              </>
            ) : null}{' '}
            y hay{' '}
            <strong className={open > 0 ? 'sp-neg' : undefined}>
              {nfInt.format(open)} roturas
            </strong>{' '}
            abiertas.
          </div>
        </div>
        <div className="sp-exec-stats">
          <Stat val={nfInt.format(salesQ.data?.salesCount ?? 0)} lbl="tickets" />
          <Stat val={nfEur2.format(salesQ.data?.avgTicket ?? 0)} lbl="ticket medio" />
          <Stat val={nfEur0.format(marginQ.data?.realMargin ?? 0)} lbl="beneficio" tone="pos" />
          <Stat
            val={nfEur0.format(stockQ.data?.estimatedLostSales ?? 0)}
            lbl="venta perdida"
            tone="neg"
          />
        </div>
      </div>
    </PanelShell>
  );
}

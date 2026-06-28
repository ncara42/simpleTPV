import {
  ActivityFeed,
  type ActivityItem,
  BulletMeter,
  DataGrid,
  type DataGridColumn,
  DonutStat,
  Gauge,
  HeatLegend,
  HeatStrip,
  HeroFigure,
  KpiDual,
  KpiGrid,
  KpiStat,
  Leaderboard,
  ProjectionArea,
  rampColor,
  RibbonStat,
  ShareBar,
  SparkArea,
  SparkBars,
  Treemap,
} from '@simpletpv/ui';
import { AlertTriangle } from 'lucide-react';
import { type ReactNode, useState } from 'react';

// Galería de widgets (#264): página showcase que reproduce la maqueta "Resumen, reinventado" con las
// nuevas moléculas de @simpletpv/ui. Datos demo literales de las 5 tiendas (junio 2026), idénticos al
// diseño de origen. Sirve de referencia viva y de banco de regresión visual del lote.

// ── Datos demo (literales del diseño) ──────────────────────────────────────────
const SPARK_UP = [8, 22, 6, 22, 16, 36, 38, 9, 29, 16, 18, 14];
const SPARK_DOWN = [26, 33, 20, 32, 26, 28, 38, 30, 36, 25, 18, 10];
const SPARK_FLAT = [29, 11, 15, 38, 33, 15, 15, 38, 38, 33, 24, 6];

const HEAT = [
  { label: '07', value: 3800 },
  { label: '08', value: 6200 },
  { label: '09', value: 6100 },
  { label: '10', value: 6975 },
  { label: '11', value: 4300 },
  { label: '12', value: 4600 },
  { label: '13', value: 5400 },
  { label: '14', value: 4300 },
  { label: '15', value: 4400 },
  { label: '16', value: 4350 },
  { label: '17', value: 5600 },
];

const FAMILIES = [
  { label: 'Aceite CBD 20%', value: 11751 },
  { label: 'Aceite CBD 10%', value: 11185 },
  { label: 'Accesorios', value: 10275 },
  { label: 'Aceites CBD', value: 5270 },
  { label: 'Cosmética', value: 4510 },
  { label: 'Cremas', value: 3750 },
  { label: 'Otras familias', value: 16800 },
];

const DONUT = [
  { label: 'Aceite CBD 20%', value: 11751 },
  { label: 'Aceite CBD 10%', value: 11185 },
  { label: 'Accesorios', value: 10275 },
  { label: 'Aceites CBD', value: 5270 },
  { label: 'Cosmética', value: 4510 },
  { label: 'Otras familias', value: 20536 },
];

const STORES = [
  { label: 'Sur', value: 11945, detail: '137 tickets · 87,19 €' },
  { label: 'Online', value: 11188, detail: '136 tickets · 82,27 €' },
  { label: 'Centro', value: 10796, detail: '128 tickets · 84,34 €' },
  { label: 'Gran Vía', value: 9313, detail: '114 tickets · 81,69 €' },
  { label: 'Norte', value: 8967, detail: '114 tickets · 78,66 €' },
];

const ACTIVITY: ActivityItem[] = [
  {
    title: (
      <>
        <strong>Rotura de stock</strong> · «Prueba» agotado
      </>
    ),
    meta: 'Tienda Demo Centro · 16:45',
    tone: 'danger',
  },
  {
    title: (
      <>
        <strong>Rotura de stock</strong> · Aceite CBD + Melatonina
      </>
    ),
    meta: 'Tienda Demo Gran Vía · 16:43',
    tone: 'danger',
  },
  {
    title: (
      <>
        <strong>Venta</strong> · ticket T06-000151 · 142,30 €
      </>
    ),
    meta: 'Almacén Demo · Admin Demo · 14:14',
    tone: 'accent',
  },
  {
    title: (
      <>
        <strong>Stock bajo</strong> · Filtros x100 (9 ud)
      </>
    ),
    meta: 'Tienda Demo Centro · 13:02',
    tone: 'warning',
  },
  {
    title: (
      <>
        <strong>Venta</strong> · ticket 01-…-001 · 219,50 €
      </>
    ),
    meta: 'Tienda Demo Centro · 12:07',
    tone: 'accent',
  },
];

const PALETTE = [
  { c: '#0070f3', name: 'Azul Vercel' },
  { c: '#18181b', name: 'Tinta' },
  { c: '#52525b', name: 'Gris frío' },
  { c: '#117a3b', name: 'Éxito' },
  { c: '#ab5300', name: 'Aviso' },
  { c: '#d6201f', name: 'Peligro' },
];

// ── Datos demo lote 2 ───────────────────────────────────────────────────────────
// Serie acumulada lineal de `total` en `n` días (las curvas del diseño son casi lineales).
function cumul(total: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.round((total * (i + 1)) / n));
}
const ACUM_ACTUAL = cumul(63527, 24);
const ACUM_COMPARE = cumul(96000, 30); // mayo: mes anterior, ritmo más alto
const PAYMENTS = [
  { label: 'Efectivo', value: 80 },
  { label: 'Tarjeta', value: 20 },
];

interface TicketRow {
  ticket: string;
  tienda: string;
  vendedor: string;
  metodo: 'Efectivo' | 'Tarjeta';
  importe: number;
}
const TICKETS: TicketRow[] = [
  {
    ticket: 'T06-000151',
    tienda: 'Almacén Demo',
    vendedor: 'Admin Demo',
    metodo: 'Efectivo',
    importe: 142.3,
  },
  {
    ticket: '01-20260612-001',
    tienda: 'Tienda Demo Centro',
    vendedor: 'Dependiente Demo',
    metodo: 'Efectivo',
    importe: 219.5,
  },
  {
    ticket: '06-20260612-007',
    tienda: 'Almacén Demo',
    vendedor: 'Dependiente Demo',
    metodo: 'Tarjeta',
    importe: 179.7,
  },
  {
    ticket: '05-20260612-002',
    tienda: 'Tienda Demo Online',
    vendedor: 'Dependiente Demo',
    metodo: 'Efectivo',
    importe: 159.0,
  },
  {
    ticket: '03-20260612-007',
    tienda: 'Tienda Demo Sur',
    vendedor: 'Dependiente Demo',
    metodo: 'Efectivo',
    importe: 123.8,
  },
  {
    ticket: '04-20260612-003',
    tienda: 'Tienda Demo Gran Vía',
    vendedor: 'Dependiente Demo',
    metodo: 'Efectivo',
    importe: 89.7,
  },
];
const TICKET_COLS: DataGridColumn[] = [
  { key: 'ticket', header: 'Ticket', mono: true },
  { key: 'tienda', header: 'Tienda' },
  { key: 'vendedor', header: 'Vendedor' },
  {
    key: 'metodo',
    header: 'Método',
    render: (row) => {
      const m = String(row.metodo);
      return (
        <span className={`dv-cell-badge${m === 'Tarjeta' ? ' dv-cell-badge--accent' : ''}`}>
          {m}
        </span>
      );
    },
  },
  { key: 'importe', header: 'Importe', format: 'eur', align: 'right' },
];

// ── Helpers de chrome ──────────────────────────────────────────────────────────
function Section({
  num,
  title,
  sub,
  children,
}: {
  num: string;
  title: string;
  sub: string;
  children?: ReactNode;
}) {
  return (
    <section className="gw-section">
      <div className="gw-container">
        <div className="gw-section-head">
          <span className="gw-section-num">{num}</span>
          <h2 className="gw-section-title">{title}</h2>
        </div>
        <p className="gw-section-sub">{sub}</p>
      </div>
      {children}
    </section>
  );
}

function Card({
  title,
  badge,
  sub,
  aside,
  children,
}: {
  title: string;
  badge?: string;
  sub?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="gw-card">
      <div className="gw-card-head">
        <div>
          <h3 className="gw-card-title">
            {title}
            {badge ? <span className="gw-badge">{badge}</span> : null}
          </h3>
          {sub ? <p className="gw-card-sub">{sub}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  );
  const flip = (): void => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    setDark(!dark);
  };
  return (
    <button type="button" className="gw-themetoggle" onClick={flip}>
      {dark ? '☀︎ Claro' : '☾ Oscuro'}
    </button>
  );
}

// Tarjeta de mini-gráfica: rótulo en mayúsculas + viz de bolsillo.
function Mini({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="gw-mini">
      <div className="gw-mini-label">{label}</div>
      {children}
    </div>
  );
}

// Mini-aside del ribbon: contenedor de ancho fijo para una mini-viz.
function Aside({ w, children }: { w: number; children: ReactNode }) {
  return <span style={{ width: w, height: 20, display: 'block' }}>{children}</span>;
}

export function WidgetGallery() {
  return (
    <div className="gw-root">
      {/* Header */}
      <div className="gw-container">
        <div className="gw-header">
          <div>
            <div className="gw-eyebrow">SimpleTPV · Backoffice</div>
            <h1 className="gw-title">Resumen, reinventado.</h1>
            <p className="gw-lede">
              Widgets de panel rediseñados sobre la <strong>Fundación Geist</strong>: tarjetas
              planas, hairlines, un único acento azul y data-viz monocromática. Datos en vivo de las
              5 tiendas demo — junio 2026.
            </p>
          </div>
          <div className="gw-head-controls">
            <div className="gw-segment">
              <button type="button">Hoy</button>
              <button type="button">Semana</button>
              <button type="button" className="is-active">
                Mes
              </button>
            </div>
            <ThemeToggle />
          </div>
        </div>
        <div className="gw-palette">
          <span className="gw-palette-label">Paleta</span>
          {PALETTE.map((p) => (
            <span key={p.name} className="gw-chip">
              <span style={{ background: p.c }} />
              {p.name}
            </span>
          ))}
        </div>
        <div className="gw-rule" />
      </div>

      {/* 01 — KPIs */}
      <Section
        num="01"
        title="KPIs"
        sub="Rejilla conectada por hairline al estilo Vercel Analytics. El gap de 1px hace de divisor; la sparkline va a sangre al pie de cada celda."
      >
        <div className="gw-band">
          <KpiGrid columns={6} bleed>
            <KpiStat
              label="Facturación"
              value={63526.52}
              format="eur"
              chip={{ text: '24 / 30 días' }}
              spark={SPARK_UP}
            />
            <KpiStat
              label="Ticket medio"
              value={83.37}
              format="eur"
              chip={{ text: '↑ 0,8 %', tone: 'success' }}
              spark={SPARK_UP}
            />
            <KpiStat
              label="Uds. / ticket"
              value={3.89}
              valueText="3,89"
              chip={{ text: '↓ 1,2 %', tone: 'danger' }}
              spark={SPARK_DOWN}
              sparkTone="danger"
            />
            <KpiStat
              label="% Margen"
              value={59.8}
              valueText="59,8 %"
              chip={{ text: '−0,2 pp' }}
              spark={SPARK_FLAT}
              sparkTone="neutral"
            />
            <KpiStat
              label="Beneficio"
              value={37991.62}
              format="eur"
              chip={{ text: '↑ 3,1 %', tone: 'success' }}
              spark={SPARK_UP}
            />
            <KpiStat
              label="Venta perdida est."
              value={207.3}
              format="eur"
              chip={{ text: '9 roturas', tone: 'danger' }}
              spark={SPARK_DOWN}
              sparkTone="danger"
            />
          </KpiGrid>
        </div>
        <div className="gw-container">
          <div className="gw-grid gw-grid--3">
            <KpiStat
              variant="card"
              label="Facturación"
              value={63526.52}
              format="eur"
              chip={{ text: '↑ 12,4 %', tone: 'success' }}
              spark={SPARK_UP}
            />
          </div>
        </div>
      </Section>

      {/* 02 — Gráficas (heatmap del lote 1) */}
      <Section
        num="02"
        title="Gráficas"
        sub="Data-viz monocromática: serie principal en azul, comparación en gris. Sin arcoíris."
      >
        <div className="gw-container">
          <div className="gw-grid">
            <Card
              title="Mapa de calor horario"
              badge="ALT"
              sub="Intensidad de ventas por hora — lectura instantánea de los picos"
              aside={<HeatLegend />}
            >
              <HeatStrip items={HEAT} />
            </Card>
          </div>
        </div>
      </Section>

      {/* 03 — Compactos y alternativas (treemap + donut + leaderboard) */}
      <Section
        num="03"
        title="Compactos y alternativas"
        sub="Densidades y vistas alternativas para el mismo dato: treemap, donut minimal y leaderboard."
      >
        <div className="gw-container">
          <div className="gw-grid gw-grid--2">
            <Card
              title="Mix por familia"
              badge="TREEMAP"
              sub="Área proporcional a la facturación · junio"
            >
              <Treemap items={FAMILIES} format="eur0" />
            </Card>
            <Card title="Mix de ventas" badge="DONUT" sub="Variante circular monocroma">
              <DonutStat
                items={DONUT}
                format="eur0"
                centerValue={63527}
                centerCaption="6 familias"
              />
            </Card>
          </div>
          <div className="gw-grid">
            <Card
              title="Clasificación de tiendas"
              badge="LEADERBOARD"
              sub="Facturación · tickets · ticket medio · junio"
            >
              <Leaderboard items={STORES} format="eur0" />
            </Card>
          </div>
        </div>
      </Section>

      {/* 04 — Más exploraciones (bullet) */}
      <Section
        num="04"
        title="Más exploraciones"
        sub="Objetivos y operativa diaria con la misma limpieza."
      >
        <div className="gw-container">
          <div className="gw-grid gw-grid--2">
            <Card title="Objetivo del mes" badge="BULLET" sub="Junio · objetivo 85.000 €">
              <BulletMeter value={63527} projection={79408} target={85000} format="eur0" />
            </Card>
            <Card title="Actividad" badge="FEED" sub="Ventas y alertas recientes">
              <ActivityFeed items={ACTIVITY} />
            </Card>
          </div>
        </div>
      </Section>

      {/* 05 — Operativa (mes vs mes, métodos de pago, tickets) */}
      <Section
        num="05"
        title="Operativa"
        sub="Acumulado con proyección, reparto de pagos y últimas ventas."
      >
        <div className="gw-container">
          <div className="gw-grid">
            <Card
              title="Acumulado mes vs mes"
              sub="Facturación acumulada diaria · junio vs mayo"
              aside={
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  <span className="gw-legend-line">
                    <span
                      style={{
                        width: 14,
                        height: 3,
                        borderRadius: 2,
                        background: 'var(--ui-brand)',
                      }}
                    />
                    Junio
                  </span>
                  <span className="gw-legend-line">
                    <span
                      style={{
                        width: 14,
                        height: 3,
                        borderRadius: 2,
                        background: 'var(--ui-border-strong)',
                      }}
                    />
                    Mayo
                  </span>
                  <span className="gw-legend-line">
                    <span
                      style={{ width: 14, height: 0, borderTop: '2px dashed var(--ui-brand)' }}
                    />
                    Proyección
                  </span>
                </div>
              }
            >
              <div className="gw-stats-row">
                <div>
                  <div className="gw-stat-k">Junio · 24 días</div>
                  <div className="gw-stat-v">63.527 €</div>
                </div>
                <div>
                  <div className="gw-stat-k">Proyección fin de mes</div>
                  <div className="gw-stat-v">79.408 €</div>
                </div>
                <div>
                  <div className="gw-stat-k">Ritmo diario vs mayo</div>
                  <div className="gw-stat-v" style={{ color: 'var(--ui-danger)' }}>
                    −45,9 %
                  </div>
                </div>
              </div>
              <ProjectionArea
                actual={ACUM_ACTUAL}
                compare={ACUM_COMPARE}
                projectionEnd={79408}
                totalPoints={30}
                height={240}
              />
            </Card>
          </div>
          <div className="gw-grid gw-grid--2">
            <Card title="Tickets recientes" sub="Últimas ventas registradas">
              <DataGrid
                columns={TICKET_COLS}
                rows={TICKETS as unknown as Array<Record<string, unknown>>}
              />
            </Card>
            <Card title="Métodos de pago" sub="Muestra reciente de tickets">
              <ShareBar items={PAYMENTS} />
            </Card>
          </div>
        </div>
      </Section>

      {/* 06 — Ribbon compacto + cifra-héroe */}
      <Section
        num="06"
        title="Compactos y hero"
        sub="Ribbon de métricas secundarias y la cifra del mes a gran tamaño."
      >
        <div className="gw-band">
          <KpiGrid columns={6} bleed>
            <RibbonStat
              label="Tickets"
              value={762}
              format="integer"
              aside={
                <Aside w={54}>
                  <SparkArea data={SPARK_FLAT} tone="neutral" height={20} />
                </Aside>
              }
            />
            <RibbonStat
              label="Margen bruto"
              value={38004}
              format="eur0"
              aside={
                <Aside w={54}>
                  <SparkArea data={SPARK_UP} height={20} />
                </Aside>
              }
            />
            <RibbonStat
              label="COGS"
              value={25522}
              format="eur0"
              aside={
                <Aside w={54}>
                  <SparkArea data={SPARK_FLAT} tone="neutral" height={20} />
                </Aside>
              }
            />
            <RibbonStat
              label="Tasa devolución"
              value={0.07}
              valueText="0,07 %"
              aside={
                <Aside w={54}>
                  <SparkArea data={SPARK_DOWN} tone="neutral" height={20} />
                </Aside>
              }
            />
            <RibbonStat
              label="Tasa descuento"
              value={0.02}
              valueText="0,02 %"
              aside={
                <Aside w={54}>
                  <SparkArea data={SPARK_UP} tone="neutral" height={20} />
                </Aside>
              }
            />
            <RibbonStat
              label="Tiendas activas"
              value={5}
              format="integer"
              aside={
                <Aside w={56}>
                  <SparkBars data={[1, 1, 1, 1, 1]} accent="topN" topN={5} height={18} />
                </Aside>
              }
            />
          </KpiGrid>
        </div>
        <div className="gw-container">
          <div className="gw-grid" style={{ marginTop: 22 }}>
            <div className="gw-card" style={{ padding: 0, overflow: 'hidden' }}>
              <HeroFigure
                eyebrow="Facturación · junio"
                badge="HERO"
                value={63526.52}
                format="eur"
                chips={[
                  { text: '762 tickets' },
                  { text: '83,37 € ticket medio' },
                  { text: '59,8 % margen' },
                  { text: '↑ 12,4 % vs media', tone: 'success' },
                ]}
                spark={SPARK_UP}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* 07 — KPIs · más formatos */}
      <Section
        num="07"
        title="KPIs · más formatos"
        sub="Diez maneras de presentar una cifra. Mismo dato, distinta jerarquía y densidad."
      >
        <div className="gw-container">
          <div className="gw-grid gw-grid--5">
            <KpiStat
              variant="card"
              corner="7 DÍAS"
              label="Ventas / día"
              valueText="2.647 €"
              bars={[62, 78, 54, 90, 70, 46, 100]}
              barsAccent="last"
            />
            <KpiDual
              corner="DUAL"
              top={{ label: 'Margen', value: 59.8, valueText: '59,8%' }}
              bottom={{ label: 'Beneficio', value: 37992, format: 'eur0' }}
            />
            <KpiStat
              variant="card"
              tone="danger"
              corner="ALERTA"
              label="Venta perdida"
              valueText="207,30 €"
              chip={{
                text: '9 roturas',
                tone: 'danger',
                icon: <AlertTriangle size={11} aria-hidden="true" />,
              }}
            />
            <KpiStat
              variant="card"
              corner="ÁREA"
              label="Beneficio"
              valueText="37.992 €"
              spark={SPARK_UP}
            />
            <KpiStat
              variant="card"
              corner="CLÁSICA"
              label="Facturación"
              value={63526.52}
              format="eur"
              chip={{ text: '↑ 12,4 %', tone: 'success' }}
              spark={SPARK_UP}
            />
          </div>
        </div>
      </Section>

      {/* 08 — Mini gráficas */}
      <Section
        num="08"
        title="Mini gráficas"
        sub="Visualizaciones de bolsillo para rejillas densas o tarjetas pequeñas."
      >
        <div className="gw-container">
          <div className="gw-mini-grid">
            <Mini label="Barras · tiendas">
              <SparkBars
                data={[100, 94, 90, 78, 75]}
                accent="topN"
                topN={3}
                height={64}
                mutedPct={26}
                gap={7}
              />
            </Mini>
            <Mini label="Línea · tendencia">
              <SparkArea data={[20, 44, 42, 58, 36, 52, 44, 68, 56, 78, 64]} height={64} />
            </Mini>
            <Mini label="Área · acumulado">
              <SparkArea data={[10, 22, 32, 40, 54, 62, 72]} height={64} />
            </Mini>
            <Mini label="Donut · mix">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span className="gw-mini-sub">6 fam.</span>
                <svg
                  viewBox="0 0 64 64"
                  width={64}
                  height={64}
                  style={{ marginLeft: 'auto', flex: 'none' }}
                  aria-hidden="true"
                >
                  <g transform="rotate(-90 32 32)" fill="none" strokeWidth={9}>
                    <circle cx="32" cy="32" r="26" stroke={rampColor(0)} strokeDasharray="30 133" />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      stroke={rampColor(1)}
                      strokeDasharray="29 134"
                      strokeDashoffset={-30}
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      stroke={rampColor(2)}
                      strokeDasharray="26 137"
                      strokeDashoffset={-59}
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      stroke={rampColor(4)}
                      strokeDasharray="78 85"
                      strokeDashoffset={-85}
                    />
                  </g>
                </svg>
              </div>
            </Mini>
            <Mini label="Gauge · margen">
              <Gauge value={59.8} valueText="59,8%" />
            </Mini>
            <Mini label="Top familias">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {(
                  [
                    ['Aceite 20%', 100],
                    ['Aceite 10%', 95],
                    ['Accesorios', 87],
                  ] as Array<[string, number]>
                ).map(([n, w]) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        fontSize: 11.5,
                        width: 64,
                        color: 'var(--ui-text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {n}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        height: 6,
                        background: 'var(--ui-surface-subtle)',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          width: `${w}%`,
                          height: '100%',
                          background: 'var(--ui-brand)',
                        }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </Mini>
            <Mini label="Stacked · pago">
              <ShareBar items={PAYMENTS} barHeight={14} legend="inline" />
            </Mini>
            <Mini label="Bullet · objetivo">
              <div
                style={{
                  position: 'relative',
                  height: 14,
                  background: 'var(--ui-surface-subtle)',
                  borderRadius: 5,
                  marginTop: 6,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '74.7%',
                    background: 'var(--ui-brand)',
                    borderRadius: '5px 0 0 5px',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    left: '94%',
                    top: -5,
                    bottom: -5,
                    width: 3,
                    background: 'var(--ui-text)',
                    borderRadius: 2,
                  }}
                />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ui-text-soft)', marginTop: 12 }}>
                74,7% · objetivo 85.000 €
              </div>
            </Mini>
            <Mini label="Heatmap · horas">
              <HeatStrip items={HEAT} showLabels={false} markPeak={false} />
              <div className="gw-heat-hours">
                <span>7h</span>
                <span>17h</span>
              </div>
            </Mini>
            <Mini label="Columnas · hora">
              <SparkBars
                data={[61, 95, 95, 100, 75, 79, 87, 75, 77, 76, 92]}
                accent="max"
                mutedPct={14}
                height={64}
                gap={4}
              />
            </Mini>
          </div>
        </div>
      </Section>

      <div className="gw-container" style={{ marginTop: 64 }}>
        <div className="gw-rule" style={{ marginTop: 0 }} />
        <p style={{ fontSize: 13, color: 'var(--ui-text-soft)', marginTop: 24 }}>
          SimpleTPV · Fundación Geist · lotes 1–2 — KPIs y variantes, heatmap, treemap, donut,
          bullet, leaderboard, feed, mes-vs-mes, métodos de pago, tickets, ribbon, hero y
          mini-gráficas.
        </p>
      </div>
    </div>
  );
}

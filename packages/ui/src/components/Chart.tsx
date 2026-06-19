import * as React from 'react';

import { cn } from '../lib/cn.js';
import { monotonePath, niceTicks, type Point } from '../lib/curve.js';

export interface ChartBar {
  /** Etiqueta bajo la barra (también la key de selección). */
  label: string;
  /** Valor principal (barra de acento de marca). */
  value: number;
  /** Valor de comparación opcional (barra neutra al lado, p. ej. "ayer"). */
  compareValue?: number;
  /** Texto del valor en el tooltip y el aria; por defecto, `value` formateado. */
  valueText?: string;
  /** Texto de la comparación en el tooltip; por defecto, `compareValue` formateado. */
  compareText?: string;
  /** Línea extra del tooltip (p. ej. el delta "+12 %"). */
  tipExtra?: string;
  /** Tono del delta (tipExtra) en el tooltip: verde/rojo/neutro por signo. */
  tipExtraTone?: 'up' | 'down' | 'neutral';
  /** Tooltip estructurado (columnas etiqueta↔importe): etiqueta del periodo actual. */
  tipValueLabel?: string;
  /** Tooltip estructurado: importe del periodo actual, alineado a la derecha. */
  tipValueAmount?: string;
  /** Tooltip estructurado: etiqueta del periodo de comparación. */
  tipCompareLabel?: string;
  /** Tooltip estructurado: importe del periodo de comparación. */
  tipCompareAmount?: string;
  /** Texto secundario bajo la etiqueta (p. ej. el delta "+12 %"). */
  subValue?: string;
  /** Tono del texto secundario: verde (sube), rojo (baja) o neutro. */
  subTone?: 'up' | 'down' | 'neutral';
}

export interface ChartProps {
  data: ChartBar[];
  /** Alto del lienzo de barras en px. Por defecto 248 (§10.16). */
  height?: number;
  /** Formatea números a texto en tooltip/aria cuando no se aporta `*Text`. */
  formatValue?: (value: number) => string;
  /** Formatea las etiquetas del eje Y; por defecto usa `formatValue`. */
  formatAxis?: (value: number) => string;
  /** Líneas de referencia + eje Y con pasos redondos (estilo cuadro de mando). Por defecto, true. */
  showGrid?: boolean;
  /**
   * Rotula cada barra con su valor en vertical (-90°) sobre la columna, para leer
   * las cifras sin pasar el ratón. Reserva holgura arriba para que la etiqueta de
   * la barra más alta no se corte. Solo aplica a `kind="bars"`. Por defecto, false.
   */
  barValues?: boolean;
  /** Representación: barras (default), línea con área (U-02) o área (alias de línea:
   *  la variante línea ya rellena el área con gradiente). Misma escala, mismos labels
   *  y mismo tooltip lateral en todas. */
  kind?: 'bars' | 'line' | 'area';
  /**
   * Solo modo línea: px que el trazo sangra a cada lado (para cancelar el padding
   * del panel y que la línea toque el filo de la card). Los puntos y las etiquetas
   * se reinsertan ese mismo margen, así que quedan alineados y respetan el borde.
   * Por defecto 0 (sin sangrado).
   */
  edgeBleed?: number;
  /** Si es false, desactiva todas las animaciones/transiciones del gráfico
   *  (entrada de barras, fade del tooltip, hover de puntos/barras). Por defecto true. */
  animated?: boolean;
  /** Etiqueta seleccionada: solo semántica (aria-pressed); no altera el color. */
  selected?: string;
  /** Si se aporta, cada columna es un `<button>` que emite su `label` al pulsarla. */
  onSelect?: (label: string) => void;
  /** Etiqueta accesible del conjunto. */
  ariaLabel?: string;
  className?: string;
  'data-testid'?: string;
}

const GRID_TICKS = 4;
// Holgura sobre la barra más alta cuando se rotulan los valores: deja sitio para
// la etiqueta vertical encima de la columna sin que se corte.
const BAR_VALUE_HEADROOM = 1.3;
// Holgura superior del modo línea sin rejilla: sin un eje que redondee el máximo
// hacia arriba, el pico se mapearía a y=0 (filo superior) y el punto se cortaría
// contra el borde de la card. Un 12% deja respirar la cresta y su punto.
const LINE_HEADROOM = 1.12;

/** Capa de líneas de referencia + etiquetas del eje Y, alineada con la base del plot. */
function ChartGrid({
  ticks,
  top,
  formatAxis,
}: {
  ticks: number[];
  top: number;
  formatAxis: (v: number) => string;
}): React.ReactElement {
  return (
    <div className="ui-chart-grid" aria-hidden="true">
      {ticks.map((t) => (
        <div key={t} className="ui-chart-grid-line" style={{ bottom: `${(t / top) * 100}%` }}>
          {t > 0 && <span className="ui-chart-axis">{formatAxis(t)}</span>}
        </div>
      ))}
    </div>
  );
}

/** Tooltip flotante compartido (barras y línea). Encabezado con la etiqueta del
 *  dato (p. ej. la tienda) + mini-tabla de filas: punto del color de su serie a la
 *  izquierda, etiqueta del periodo, e importe alineado a la derecha. Cierra con el
 *  delta coloreado por signo. Cuando no hay etiqueta de periodo (p. ej. ventas por
 *  hora), la fila muestra solo el importe. */
function ChartTip({
  title,
  valueName,
  valueAmount,
  compareName,
  compareAmount,
  extra,
  extraTone,
  edgeClass,
  style,
}: {
  title?: string;
  valueName?: string | undefined;
  valueAmount: string;
  compareName?: string | undefined;
  compareAmount?: string | null;
  extra?: string | undefined;
  extraTone?: 'up' | 'down' | 'neutral' | undefined;
  edgeClass?: string;
  style?: React.CSSProperties;
}): React.ReactElement {
  return (
    <div className={cn('ui-chart-tip', edgeClass)} style={style} aria-hidden="true">
      {title != null && title !== '' && <span className="ui-chart-tip-title">{title}</span>}
      <span className="ui-chart-tip-row2">
        <span className="ui-chart-tip-dot ui-chart-tip-dot-value" />
        {valueName != null && <span className="ui-chart-tip-row2-name">{valueName}</span>}
        <span className="ui-chart-tip-row2-amount">{valueAmount}</span>
      </span>
      {compareAmount != null && (
        <span className="ui-chart-tip-row2 is-compare">
          <span className="ui-chart-tip-dot ui-chart-tip-dot-compare" />
          {compareName != null && <span className="ui-chart-tip-row2-name">{compareName}</span>}
          <span className="ui-chart-tip-row2-amount">{compareAmount}</span>
        </span>
      )}
      {extra != null && (
        <span className={cn('ui-chart-tip-delta', extraTone && `ui-chart-tip-delta-${extraTone}`)}>
          {extra}
        </span>
      )}
    </div>
  );
}

// Barras verticales de §10.16 (revisión U-01): color constante (nunca se atenúa el
// resto), sin cifras dentro de las barras y tooltip lateral al hover/focus con el
// valor (y comparación/delta si existen). CSS-bars (divs); el alto en % por barra.
// Las dos variantes (barras y línea) comparten banda de plot + fila de etiquetas.
export function Chart({
  data,
  height = 248,
  formatValue,
  formatAxis,
  showGrid = true,
  barValues = false,
  kind = 'bars',
  edgeBleed = 0,
  animated = true,
  selected,
  onSelect,
  ariaLabel,
  className,
  'data-testid': testid,
}: ChartProps): React.ReactElement {
  const fmt = (v: number): string => formatValue?.(v) ?? String(v);
  const fmtAxis = (v: number): string => formatAxis?.(v) ?? fmt(v);
  const gradientId = React.useId();
  const [tipFor, setTipFor] = React.useState<number | null>(null);

  // El máximo cubre valor y comparación para que ambas series compartan escala.
  const rawMax = Math.max(
    1,
    ...data.map((b) => Math.max(b.value, b.compareValue ?? Number.NEGATIVE_INFINITY)),
  );
  const base = showGrid ? niceTicks(rawMax, GRID_TICKS) : { top: rawMax, ticks: [] as number[] };
  // Holgura superior: con barras rotuladas (etiqueta encima) o en línea sin rejilla
  // (el pico no debe tocar el filo superior). La rejilla ya redondea hacia arriba.
  const isLine = kind === 'line' || kind === 'area';
  let max = base.top;
  if (barValues) max = Math.max(max, rawMax * BAR_VALUE_HEADROOM);
  if (isLine && !showGrid) max = Math.max(max, rawMax * LINE_HEADROOM);
  const axisTicks = base.ticks;
  // Sin eje (showGrid=false) colapsamos el canal izquierdo reservado a los números.
  const noAxisClass = showGrid ? '' : 'ui-chart-no-axis';

  // ¿Cabe la etiqueta vertical DENTRO de la barra? Estimamos el alto de la barra
  // en px (valor/escala · alto útil del plot) y el largo del texto rotado (nº de
  // caracteres · avance medio). Si cabe con holgura → dentro centrada; si no →
  // fuera (encima). Aproximación suficiente para decidir posición y contraste.
  const TAG_FONT_PX = 0.66 * 16; // .ui-chart-bar-tag-text
  const TAG_CHAR_PX = TAG_FONT_PX * 0.62; // avance medio por carácter (tabular)
  const TAG_PAD_PX = 12; // margen mínimo dentro de la barra
  const plotPx = Math.max(40, height - 26); // alto del plot ≈ total − (labels + gap)
  const tagFitsInside = (value: number, text: string): boolean =>
    (value / max) * plotPx >= text.length * TAG_CHAR_PX + TAG_PAD_PX;

  const names = (
    <div className="ui-chart-names" aria-hidden="true">
      {data.map((bar) => (
        <span key={bar.label} className="ui-chart-name-cell">
          <span className="ui-chart-name" title={bar.label}>
            {bar.label}
          </span>
          {bar.subValue != null && (
            <span className={cn('ui-chart-sub', `ui-chart-sub-${bar.subTone ?? 'neutral'}`)}>
              {bar.subValue}
            </span>
          )}
        </span>
      ))}
    </div>
  );

  if (isLine) {
    return (
      <ChartLine
        data={data}
        height={height}
        fmt={fmt}
        fmtAxis={fmtAxis}
        max={max}
        ticks={axisTicks}
        gradientId={gradientId}
        tipFor={tipFor}
        setTipFor={setTipFor}
        names={names}
        noAxisClass={noAxisClass}
        edgeBleed={edgeBleed}
        animated={animated}
        ariaLabel={ariaLabel}
        className={className}
        testid={testid}
      />
    );
  }

  return (
    <div
      className={cn(
        'ui-chart ui-chart-bars',
        noAxisClass,
        !animated && 'ui-chart-no-anim',
        className,
      )}
      style={{ height }}
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      data-testid={testid}
    >
      <div className="ui-chart-plot">
        {showGrid && <ChartGrid ticks={axisTicks} top={max} formatAxis={fmtAxis} />}
        {/* Línea base única y continua (no por columna, así no se ve segmentada por
            los huecos). Con edgeBleed sangra hasta los filos de la card. */}
        <div
          className="ui-chart-baseline"
          style={edgeBleed > 0 ? { left: -edgeBleed, right: -edgeBleed } : undefined}
          aria-hidden="true"
        />
        <div className="ui-chart-cols">
          {data.map((bar, i) => {
            const isSelected = bar.label === selected;
            const valuePct = `${((bar.value / max) * 100).toFixed(2)}%`;
            const comparePct =
              bar.compareValue != null ? `${((bar.compareValue / max) * 100).toFixed(2)}%` : null;
            const valueLabel = bar.valueText ?? fmt(bar.value);
            const compareLabel =
              bar.compareValue != null ? (bar.compareText ?? fmt(bar.compareValue)) : null;
            // Tooltip anclado a la cima de la barra de valor; en los bordes se alinea
            // al lado interior para no salirse del panel.
            const tipEdge =
              i === 0 ? 'ui-chart-tip-start' : i === data.length - 1 ? 'ui-chart-tip-end' : '';
            const valTagText = fmt(bar.value);
            const cmpTagText = bar.compareValue != null ? fmt(bar.compareValue) : null;
            const inner = (
              <div className="ui-chart-pair">
                {comparePct != null && (
                  <div className="ui-chart-bar ui-chart-bar-compare" style={{ height: comparePct }}>
                    {/* Sin rótulo cuando el valor es 0: el "0 €" flotaría sobre el
                        muñón mínimo como un artefacto. La ausencia de barra ya lo dice. */}
                    {barValues && cmpTagText != null && bar.compareValue! > 0 && (
                      <span
                        className={cn(
                          'ui-chart-bar-tag',
                          tagFitsInside(bar.compareValue!, cmpTagText) ? 'is-inside' : 'is-outside',
                        )}
                      >
                        <span className="ui-chart-bar-tag-text">{cmpTagText}</span>
                      </span>
                    )}
                  </div>
                )}
                <div className="ui-chart-bar ui-chart-bar-value" style={{ height: valuePct }}>
                  {barValues && bar.value > 0 && (
                    <span
                      className={cn(
                        'ui-chart-bar-tag',
                        tagFitsInside(bar.value, valTagText) ? 'is-inside' : 'is-outside',
                      )}
                    >
                      <span className="ui-chart-bar-tag-text">{valTagText}</span>
                    </span>
                  )}
                </div>
                {tipFor === i && !barValues && (
                  <ChartTip
                    title={bar.label}
                    valueName={bar.tipValueLabel}
                    valueAmount={bar.tipValueAmount ?? valueLabel}
                    compareName={bar.tipCompareLabel}
                    compareAmount={
                      bar.compareValue != null ? (bar.tipCompareAmount ?? compareLabel) : null
                    }
                    extra={bar.tipExtra}
                    extraTone={bar.tipExtraTone}
                    edgeClass={tipEdge}
                    style={{ bottom: `calc(${valuePct} + 10px)` }}
                  />
                )}
              </div>
            );
            const aria = [valueLabel, compareLabel, bar.tipExtra].filter(Boolean).join(' · ');
            const hoverHandlers = barValues
              ? {}
              : {
                  onMouseEnter: () => setTipFor(i),
                  onMouseLeave: () => setTipFor((v) => (v === i ? null : v)),
                  onFocus: () => setTipFor(i),
                  onBlur: () => setTipFor((v) => (v === i ? null : v)),
                };
            const shared = {
              style: { '--i': i } as React.CSSProperties,
              ...hoverHandlers,
              'data-testid': 'ui-chart-group',
            };
            return onSelect ? (
              <button
                key={bar.label}
                type="button"
                className="ui-chart-group"
                aria-pressed={isSelected}
                aria-label={`${bar.label}: ${aria}`}
                onClick={() => onSelect(bar.label)}
                {...shared}
              >
                {inner}
              </button>
            ) : (
              <div
                key={bar.label}
                className="ui-chart-group"
                tabIndex={0}
                aria-label={`${bar.label}: ${aria}`}
                {...shared}
              >
                {inner}
              </div>
            );
          })}
        </div>
      </div>
      {names}
    </div>
  );
}

// Variante línea (U-02): área con gradiente + curva monótona sobre la misma escala
// que las barras. Los "hotzones" (una franja invisible por dato) reciben hover/focus
// y disparan el MISMO tooltip lateral, con guía vertical (crosshair) y punto resaltado.
function ChartLine({
  data,
  height,
  fmt,
  fmtAxis,
  max,
  ticks,
  gradientId,
  tipFor,
  setTipFor,
  names,
  noAxisClass,
  edgeBleed = 0,
  animated = true,
  ariaLabel,
  className,
  testid,
}: {
  data: ChartBar[];
  height: number;
  fmt: (v: number) => string;
  fmtAxis: (v: number) => string;
  max: number;
  ticks: number[];
  gradientId: string;
  tipFor: number | null;
  setTipFor: React.Dispatch<React.SetStateAction<number | null>>;
  names: React.ReactNode;
  noAxisClass?: string | undefined;
  edgeBleed?: number;
  animated?: boolean;
  ariaLabel?: string | undefined;
  className?: string | undefined;
  testid?: string | undefined;
}): React.ReactElement {
  const n = Math.max(1, data.length);
  const yPct = (v: number): number => (v / max) * 100;

  // Sangrado a los bordes de la card: el lienzo se ensancha edgeBleed px por lado
  // (cancela el padding del panel) para que la LÍNEA toque el filo, pero los PUNTOS,
  // ETIQUETAS y tooltip se reinsertan ese margen (alineados entre sí). Mapear el % de
  // los puntos dentro del lienzo ensanchado requiere medir su ancho real.
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = (): void => setCanvasW(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Fracción del lienzo que ocupa el margen a cada lado (0 si no hay sangrado o aún
  // no se ha medido → degrada a sin inset). La región interior es [inset, 1-inset].
  const insetFrac = edgeBleed > 0 && canvasW > 0 ? edgeBleed / canvasW : 0;
  const insetPct = insetFrac * 100;
  const innerPct = 100 - 2 * insetPct;
  // x del dato i en % del lienzo, dentro de la región interior (respeta el margen).
  const xPct = (i: number): number => insetPct + ((i + 0.5) / n) * innerPct;

  const valuePts: Point[] = data.map((b, i) => [xPct(i), 100 - yPct(b.value)]);
  const comparePts: Point[] = data
    .map((b, i): Point | null =>
      b.compareValue != null ? [xPct(i), 100 - yPct(b.compareValue)] : null,
    )
    .filter((p): p is Point => p != null);
  // Prolonga la curva hasta los bordes del lienzo (x=0 y x=100 = filos de la card)
  // repitiendo la altura del primer/último punto: la línea va a sangre, pero los
  // puntos se quedan dentro del margen (alineados con sus etiquetas).
  const toEdges = (pts: Point[]): Point[] =>
    pts.length > 0 ? [[0, pts[0]![1]], ...pts, [100, pts[pts.length - 1]![1]]] : pts;
  const valuePath = monotonePath(toEdges(valuePts));
  const comparePath = monotonePath(toEdges(comparePts));
  const hasCompare = comparePts.length > 0;
  // El área cierra la curva contra la línea base (y = 100) y vuelve al inicio, ya
  // a sangre en ambos laterales.
  const areaPath = valuePath ? `${valuePath} L 100,100 L 0,100 Z` : '';

  // El lienzo (trazo) sangra cancelando el padding del panel; los nombres se
  // reinsertan ese margen para no tocar el filo y seguir cuadrados con los puntos.
  const bleedStyle: React.CSSProperties =
    edgeBleed > 0 ? { marginInline: -edgeBleed, width: `calc(100% + ${2 * edgeBleed}px)` } : {};

  return (
    <div
      className={cn(
        'ui-chart ui-chart-line',
        noAxisClass,
        !animated && 'ui-chart-no-anim',
        className,
      )}
      style={{ height, ...bleedStyle }}
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      data-testid={testid}
    >
      <div className="ui-chart-plot">
        {ticks.length > 0 && <ChartGrid ticks={ticks} top={max} formatAxis={fmtAxis} />}
        <div className="ui-chart-line-canvas" ref={canvasRef}>
          <svg
            className="ui-chart-line-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            {areaPath && (
              <path className="ui-chart-line-area" d={areaPath} fill={`url(#${gradientId})`} />
            )}
            {hasCompare && (
              <path
                className="ui-chart-line-path-compare"
                d={comparePath}
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path className="ui-chart-line-path" d={valuePath} vectorEffect="non-scaling-stroke" />
          </svg>
          {data.map((bar, i) => {
            const valueLabel = bar.valueText ?? fmt(bar.value);
            const compareLabel =
              bar.compareValue != null ? (bar.compareText ?? fmt(bar.compareValue)) : null;
            const aria = [valueLabel, compareLabel, bar.tipExtra].filter(Boolean).join(' · ');
            const tipEdge =
              i === 0 ? 'ui-chart-tip-start' : i === data.length - 1 ? 'ui-chart-tip-end' : '';
            const active = tipFor === i;
            // Hotzone por dato cubriendo toda la franja (incluida la parte sangrada
            // de los extremos) para que el hover sea cómodo hasta el filo.
            const zoneLeft = i === 0 ? 0 : insetPct + (i / n) * innerPct;
            const zoneRight = i === n - 1 ? 100 : insetPct + ((i + 1) / n) * innerPct;
            // Tooltip de borde reinsertado el margen (no se pega al filo); el resto
            // centrado sobre su punto. Siempre fijo abajo, sobre la línea base.
            const tipStyle: React.CSSProperties =
              tipEdge === 'ui-chart-tip-start'
                ? { left: `${insetPct}%`, bottom: '8px' }
                : tipEdge === 'ui-chart-tip-end'
                  ? { right: `${insetPct}%`, bottom: '8px' }
                  : { left: `${xPct(i)}%`, bottom: '8px' };
            return (
              <React.Fragment key={bar.label}>
                {active && (
                  <span
                    className="ui-chart-crosshair"
                    style={{ left: `${xPct(i)}%` }}
                    aria-hidden="true"
                  />
                )}
                {bar.compareValue != null && (
                  <span
                    className="ui-chart-dot ui-chart-dot-compare"
                    style={{ left: `${xPct(i)}%`, bottom: `${yPct(bar.compareValue)}%` }}
                  />
                )}
                <span
                  className={cn('ui-chart-dot', active && 'is-active')}
                  style={{ left: `${xPct(i)}%`, bottom: `${yPct(bar.value)}%` }}
                />
                <div
                  className="ui-chart-hotzone"
                  style={{ left: `${zoneLeft}%`, width: `${zoneRight - zoneLeft}%` }}
                  tabIndex={0}
                  aria-label={`${bar.label}: ${aria}`}
                  onMouseEnter={() => setTipFor(i)}
                  onMouseLeave={() => setTipFor((v) => (v === i ? null : v))}
                  onFocus={() => setTipFor(i)}
                  onBlur={() => setTipFor((v) => (v === i ? null : v))}
                  data-testid="ui-chart-group"
                />
                {active && (
                  <ChartTip
                    title={bar.label}
                    valueName={bar.tipValueLabel}
                    valueAmount={bar.tipValueAmount ?? valueLabel}
                    compareName={bar.tipCompareLabel}
                    compareAmount={
                      bar.compareValue != null ? (bar.tipCompareAmount ?? compareLabel) : null
                    }
                    extra={bar.tipExtra}
                    extraTone={bar.tipExtraTone}
                    edgeClass={tipEdge}
                    style={tipStyle}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
      {/* Los nombres se reinsertan el margen sangrado para no tocar el filo de la
          card y quedar centrados bajo cada punto. */}
      {edgeBleed > 0 ? <div style={{ paddingInline: edgeBleed }}>{names}</div> : names}
    </div>
  );
}

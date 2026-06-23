// Agregador del informe de calidad del agente (#210/#200). Convierte una muestra de logs del target
// `chat_metrics` (emitidos por crates/http/src/chat.rs) en las métricas operativas del informe:
// iteraciones de tool-calling y respuestas vacías (canvas ops rechazadas), con soporte para comparar
// dos ventanas (antes/después). PURO: parsea texto → resumen; la lectura de ficheros vive en el
// runner gateado (`agent-metrics-report.run.test.ts`).
//
// Acepta dos formatos de log: JSON por línea (`tracing_subscriber` con `.json()`) y el formato por
// defecto `fmt::layer()` (logfmt-ish `clave=valor`). Filtra por la presencia del target
// `chat_metrics` y clasifica cada línea por sus campos (`tool_rounds` → turno; `accepted` → canvas).

export interface TurnMetric {
  toolRounds: number;
  toolCalls: number;
  canvasOps: number;
  viewActions: number;
  dataTools: number;
  hitRoundLimit: boolean;
}

export interface CanvasMetric {
  accepted: boolean;
  rejected: boolean;
  repaired: boolean;
}

export interface MetricsLog {
  turns: TurnMetric[];
  canvas: CanvasMetric[];
}

type Field = string | number | boolean;

function coerce(raw: string): Field {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  if (raw !== '' && !Number.isNaN(n)) return n;
  return raw;
}

function num(v: Field | undefined): number {
  return typeof v === 'number' ? v : Number(v ?? 0) || 0;
}

function bool(v: Field | undefined): boolean {
  return v === true || v === 'true';
}

// Quita los códigos de color ANSI que `fmt::layer()` inserta entre clave y `=` (rompen el regex).
const ANSI = new RegExp(String.fromCharCode(27) + '[[][0-9;]*m', 'g');

// Extrae los campos de una línea de log (JSON o logfmt). Aplana el objeto `fields` del formato JSON.
function fieldsFromLine(line: string): Record<string, Field> | null {
  const trimmed = line.replace(ANSI, '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const nested =
        obj.fields && typeof obj.fields === 'object' ? (obj.fields as Record<string, unknown>) : {};
      const merged = { ...obj, ...nested };
      const out: Record<string, Field> = {};
      for (const [k, val] of Object.entries(merged)) {
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
          out[k] = val;
        }
      }
      return Object.keys(out).length > 0 ? out : null;
    } catch {
      // no era JSON válido — probar logfmt
    }
  }

  const out: Record<string, Field> = {};
  const re = /(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed)) !== null) {
    let raw = m[2]!;
    if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1).replace(/\\"/g, '"');
    out[m[1]!] = coerce(raw);
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function parseMetricsLog(text: string): MetricsLog {
  const turns: TurnMetric[] = [];
  const canvas: CanvasMetric[] = [];
  for (const line of text.split('\n')) {
    if (!line.includes('chat_metrics')) continue;
    const f = fieldsFromLine(line);
    if (!f) continue;
    if ('tool_rounds' in f) {
      turns.push({
        toolRounds: num(f.tool_rounds),
        toolCalls: num(f.tool_calls),
        canvasOps: num(f.canvas_ops),
        viewActions: num(f.view_actions),
        dataTools: num(f.data_tools),
        hitRoundLimit: bool(f.hit_round_limit),
      });
    } else if ('accepted' in f) {
      const accepted = bool(f.accepted);
      canvas.push({
        accepted,
        rejected: f.rejected !== undefined ? bool(f.rejected) : !accepted,
        repaired: bool(f.repaired),
      });
    }
  }
  return { turns, canvas };
}

export interface MetricsSummary {
  turnCount: number;
  meanToolRounds: number;
  meanToolCalls: number;
  meanCanvasOps: number;
  hitRoundLimitRatePct: number;
  canvasCount: number;
  /** Respuestas vacías: canvas ops rechazadas / total. La métrica central de #200. */
  rejectedRatePct: number;
  /** Aceptadas pero reparadas por la validación (la hipótesis: la reparación evita el rechazo). */
  repairedRatePct: number;
  acceptedRatePct: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(part: number, total: number): number {
  return total === 0 ? 0 : round2((100 * part) / total);
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : round2(values.reduce((a, b) => a + b, 0) / values.length);
}

export function summarize(log: MetricsLog): MetricsSummary {
  const { turns, canvas } = log;
  const accepted = canvas.filter((c) => c.accepted).length;
  const rejected = canvas.filter((c) => c.rejected).length;
  const repaired = canvas.filter((c) => c.repaired).length;
  return {
    turnCount: turns.length,
    meanToolRounds: mean(turns.map((t) => t.toolRounds)),
    meanToolCalls: mean(turns.map((t) => t.toolCalls)),
    meanCanvasOps: mean(turns.map((t) => t.canvasOps)),
    hitRoundLimitRatePct: pct(turns.filter((t) => t.hitRoundLimit).length, turns.length),
    canvasCount: canvas.length,
    rejectedRatePct: pct(rejected, canvas.length),
    repairedRatePct: pct(repaired, canvas.length),
    acceptedRatePct: pct(accepted, canvas.length),
  };
}

// ── Render markdown ──────────────────────────────────────────────────────────────

export function renderMarkdown(summary: MetricsSummary, label = 'Muestra'): string {
  return [
    `### ${label}`,
    '',
    '| Métrica | Valor |',
    '| --- | ---: |',
    `| Turnos | ${summary.turnCount} |`,
    `| Media tool_rounds | ${summary.meanToolRounds} |`,
    `| Media tool_calls | ${summary.meanToolCalls} |`,
    `| Media canvas_ops | ${summary.meanCanvasOps} |`,
    `| % turnos que tocan techo de iteraciones | ${summary.hitRoundLimitRatePct} % |`,
    `| Canvas ops | ${summary.canvasCount} |`,
    `| % rechazadas (respuestas vacías) | ${summary.rejectedRatePct} % |`,
    `| % reparadas | ${summary.repairedRatePct} % |`,
    `| % aceptadas | ${summary.acceptedRatePct} % |`,
  ].join('\n');
}

function deltaRow(label: string, before: number, after: number, unit = ''): string {
  const delta = round2(after - before);
  const sign = delta > 0 ? '+' : '';
  return `| ${label} | ${before}${unit} | ${after}${unit} | ${sign}${delta}${unit} |`;
}

// Informe comparativo antes/después (pre-v2 vs post-v2). El delta deseado: menos respuestas vacías
// (rejectedRate ↓) y menos iteraciones (toolRounds ↓).
export function renderComparison(before: MetricsSummary, after: MetricsSummary): string {
  return [
    '### Comparativa antes/después',
    '',
    '| Métrica | Antes | Después | Δ |',
    '| --- | ---: | ---: | ---: |',
    deltaRow('Turnos', before.turnCount, after.turnCount),
    deltaRow('Media tool_rounds', before.meanToolRounds, after.meanToolRounds),
    deltaRow('Media tool_calls', before.meanToolCalls, after.meanToolCalls),
    deltaRow(
      '% techo de iteraciones',
      before.hitRoundLimitRatePct,
      after.hitRoundLimitRatePct,
      ' %',
    ),
    deltaRow('% rechazadas (vacías)', before.rejectedRatePct, after.rejectedRatePct, ' %'),
    deltaRow('% reparadas', before.repairedRatePct, after.repairedRatePct, ' %'),
  ].join('\n');
}

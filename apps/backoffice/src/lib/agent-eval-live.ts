// Runner VIVO del arnés de evaluación del agente (#226). Automatiza la mitad MANUAL documentada en
// docs/agent-eval-harness.md: por cada `EVAL_REQUESTS`, ejecuta el agente real (SSE de /chat/stream),
// recoge sus `CanvasOp`, los valida con `validateComposition` (verdad de tierra) y los puntúa con un
// juez LLM según `EVAL_RUBRIC`. Agrega contra `EVAL_THRESHOLD` y devuelve un resumen gateable.
//
// Las funciones PURAS (parseo SSE, prompt del juez, parseo de notas, agregación) son testeables en
// CI sin red; las funciones de IO (`runAgentTurn`, `judgeComposition`, `runEvalSuite`) hacen las
// llamadas reales y solo se ejercen en el gate manual (`pnpm --filter @simpletpv/backoffice eval:agent`),
// que se salta si falta configuración (ver `evalConfigFromEnv`).

import {
  EVAL_NEGATIVE_REQUESTS,
  EVAL_REQUESTS,
  EVAL_RUBRIC,
  EVAL_THRESHOLD,
  type EvalRequest,
  hasDataComposition,
  type NegativeEvalRequest,
  validateComposition,
  type Violation,
} from './agent-eval-harness.js';
import type { CanvasOp } from './chat.js';

// ── Configuración ────────────────────────────────────────────────────────────────

export interface JudgeConfig {
  baseUrl: string; // gateway OpenAI-compatible, p.ej. https://opencode.ai/zen/v1
  apiKey: string;
  model: string; // modelo barato del juez
}

export interface EvalLiveConfig {
  apiBaseUrl: string; // base de la API Rust, p.ej. http://localhost:3001
  chatPath: string; // ruta del stream de chat (por defecto /chat/stream)
  token: string; // Bearer JWT de un admin con datos demo
  agentModel: string; // modelo (barato) con el que corre el agente
  effort: 'low' | 'medium' | 'high';
  judge: JudgeConfig;
  timeoutMs: number;
  // Pausa entre peticiones (ms) y reintentos ante rate-limit (429): necesarios para tiers gratuitos
  // con límites de tokens/min bajos (p. ej. Groq free). 0 = sin pausa / sin reintento.
  requestDelayMs: number;
  maxRetries: number;
}

// Lee las variables de entorno sin depender de @types/node (el bundle del backoffice es de navegador).
function readEnv(): Record<string, string | undefined> {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env ?? {};
}

// Lee la config de entorno. Devuelve `{ config }` o `{ missing }` con las variables que faltan, para
// que el runner se salte con un mensaje claro en vez de fallar a medias.
export function evalConfigFromEnv(
  env: Record<string, string | undefined> = readEnv(),
): { config: EvalLiveConfig } | { missing: string[] } {
  const required = ['EVAL_API_URL', 'EVAL_TOKEN', 'EVAL_AGENT_MODEL', 'EVAL_JUDGE_MODEL'] as const;
  const judgeBase = env.EVAL_JUDGE_BASE_URL ?? env.OPENAI_BASE_URL;
  const judgeKey = env.EVAL_JUDGE_API_KEY ?? env.OPENAI_API_KEY;
  const missing: string[] = required.filter((k) => !env[k]);
  if (!judgeBase) missing.push('EVAL_JUDGE_BASE_URL|OPENAI_BASE_URL');
  if (!judgeKey) missing.push('EVAL_JUDGE_API_KEY|OPENAI_API_KEY');
  if (missing.length > 0) return { missing };

  return {
    config: {
      apiBaseUrl: env.EVAL_API_URL!.replace(/\/$/, ''),
      chatPath: env.EVAL_CHAT_PATH ?? '/chat/stream',
      token: env.EVAL_TOKEN!,
      agentModel: env.EVAL_AGENT_MODEL!,
      effort: (env.EVAL_EFFORT as EvalLiveConfig['effort']) ?? 'low',
      judge: {
        baseUrl: judgeBase!.replace(/\/$/, ''),
        apiKey: judgeKey!,
        model: env.EVAL_JUDGE_MODEL!,
      },
      timeoutMs: Number(env.EVAL_TIMEOUT_MS ?? 120_000),
      requestDelayMs: Number(env.EVAL_REQUEST_DELAY_MS ?? 0),
      maxRetries: Number(env.EVAL_MAX_RETRIES ?? 0),
    },
  };
}

// ── Parseo SSE (puro) ──────────────────────────────────────────────────────────

export interface SseRecord {
  event: string;
  data: unknown;
}

// Parsea el texto SSE completo (bloques separados por `\n\n`, líneas `event:`/`data:`) — mismo
// formato que `parseSseStream` del cliente. Ignora `ping` y bloques malformados.
export function parseSse(text: string): SseRecord[] {
  const out: SseRecord[] = [];
  for (const block of text.split('\n\n')) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (event === 'ping' || dataLines.length === 0) continue;
    try {
      out.push({ event, data: JSON.parse(dataLines.join('\n')) as unknown });
    } catch {
      // bloque incompleto/malformado — ignorar
    }
  }
  return out;
}

export interface AgentTurn {
  ops: CanvasOp[];
  toolCalls: number;
  viewActions: number;
  conversationId?: string;
  error?: string;
  text: string;
}

// Reduce los eventos SSE de un turno a lo que el arnés necesita: las canvas ops del agente, los
// recuentos de tool-calls/view-actions, el id de conversación y el texto narrado.
export function extractAgentTurn(sseText: string): AgentTurn {
  const ops: CanvasOp[] = [];
  let toolCalls = 0;
  let viewActions = 0;
  let conversationId: string | undefined;
  let error: string | undefined;
  let text = '';

  for (const rec of parseSse(sseText)) {
    const data = (rec.data ?? {}) as Record<string, unknown>;
    switch (rec.event) {
      case 'token':
        text += typeof data.text === 'string' ? data.text : '';
        break;
      case 'tool_call':
        toolCalls += 1;
        break;
      case 'canvas_op':
        if (data.op && typeof data.op === 'object') ops.push(data.op as CanvasOp);
        break;
      case 'view_action':
        viewActions += 1;
        break;
      case 'done':
        if (typeof data.conversationId === 'string') conversationId = data.conversationId;
        break;
      case 'error':
        error = typeof data.message === 'string' ? data.message : 'error';
        break;
    }
  }
  const turn: AgentTurn = { ops, toolCalls, viewActions, text };
  if (conversationId !== undefined) turn.conversationId = conversationId;
  if (error !== undefined) turn.error = error;
  return turn;
}

// ── Señal de tierra: ¿la composición aterrizó en el subsistema esperado? (puro) ──

function widgetIdsOf(ops: readonly CanvasOp[]): Set<string> {
  return new Set(ops.map((o) => o.widgetId).filter((w): w is string => !!w));
}

function endpointsOf(ops: readonly CanvasOp[]): Set<string> {
  const endpoints = new Set<string>();
  for (const op of ops) {
    const spec = op.genericSpec;
    if (spec?.endpoint) endpoints.add(spec.endpoint);
    const slots = (spec?.slots ?? {}) as Record<string, unknown>;
    for (const slot of Object.values(slots)) {
      if (!Array.isArray(slot)) continue;
      for (const piece of slot) {
        const ep = (piece as Record<string, unknown>)?.endpoint;
        if (typeof ep === 'string') endpoints.add(ep);
      }
    }
  }
  return endpoints;
}

// La composición «toca» el subsistema correcto si usa alguno de los bloques/endpoints esperados.
export function compositionHits(
  ops: readonly CanvasOp[],
  expectsAnyOf: readonly string[],
): boolean {
  if (expectsAnyOf.length === 0) return true;
  const widgets = widgetIdsOf(ops);
  const endpoints = endpointsOf(ops);
  return expectsAnyOf.some((t) => widgets.has(t) || endpoints.has(t));
}

// ── Juez LLM (puro: prompt + parseo) ─────────────────────────────────────────────

export const RUBRIC_KEYS: readonly string[] = EVAL_RUBRIC.map((r) => r.key);

// Construye el prompt del juez: intención de negocio + composición serializada + rúbrica. Pide JSON
// estricto con una nota 0–10 por dimensión. Determinista (temperature 0 en la llamada).
export function buildJudgePrompt(
  req: EvalRequest,
  ops: readonly CanvasOp[],
): { system: string; user: string } {
  const rubric = EVAL_RUBRIC.map((r) => `- ${r.key}: ${r.description}`).join('\n');
  const keysJson = RUBRIC_KEYS.map((k) => `"${k}": <0-10>`).join(', ');
  const system =
    'Eres un evaluador severo de composiciones de dashboard. Puntúas de 0 a 10 cada dimensión de la ' +
    'rúbrica y respondes EXCLUSIVAMENTE con un objeto JSON, sin texto alrededor ni ```.';
  const user = [
    `Intención de negocio del usuario: ${req.intent}`,
    `Petición literal: "${req.prompt}"`,
    '',
    'Composición que produjo el agente (canvas ops, JSON):',
    JSON.stringify(ops, null, 2),
    '',
    'Rúbrica (0–10 cada una):',
    rubric,
    '',
    `Responde solo con: { ${keysJson}, "comentario": "<breve>" }`,
  ].join('\n');
  return { system, user };
}

// Extrae el JSON del juez (tolera ```json fences) y valida que estén todas las dimensiones en 0–10.
export function parseJudgeScores(
  raw: string,
  keys: readonly string[] = RUBRIC_KEYS,
): Record<string, number> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1)
    throw new Error(`respuesta del juez sin JSON: ${raw.slice(0, 120)}`);
  const parsed = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  const scores: Record<string, number> = {};
  for (const key of keys) {
    const v = parsed[key];
    if (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 10) {
      throw new Error(`nota inválida para «${key}»: ${String(v)}`);
    }
    scores[key] = v;
  }
  return scores;
}

export function meanOfScores(scores: Record<string, number>): number {
  const vals = Object.values(scores);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ── Agregación (pura) ────────────────────────────────────────────────────────────

export interface EvalResult {
  id: string;
  intent: string;
  valid: boolean;
  violations: Violation[];
  widgetCount: number;
  hitsExpected: boolean;
  toolCalls: number;
  scores: Record<string, number>;
  meanScore: number;
  error?: string;
}

export interface EvalSummary {
  results: EvalResult[];
  validPct: number;
  meanScore: number;
  hitRatePct: number;
  pass: boolean;
}

export function aggregate(results: readonly EvalResult[]): EvalSummary {
  const n = results.length || 1;
  const validCount = results.filter((r) => r.valid).length;
  const hitCount = results.filter((r) => r.hitsExpected).length;
  const validPct = Math.round((100 * validCount) / n);
  const hitRatePct = Math.round((100 * hitCount) / n);
  const scored = results.filter((r) => Object.keys(r.scores).length > 0);
  const meanScore =
    scored.length > 0 ? scored.reduce((a, r) => a + r.meanScore, 0) / scored.length : 0;
  const pass = validPct >= EVAL_THRESHOLD.minValidPct && meanScore >= EVAL_THRESHOLD.minMeanScore;
  return { results: [...results], validPct, meanScore, hitRatePct, pass };
}

// ── IO: ejecuta el agente y el juez ──────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Ejecuta un turno del agente contra /chat/stream (SSE). Devuelve las canvas ops y recuentos.
export async function runAgentTurn(config: EvalLiveConfig, req: EvalRequest): Promise<AgentTurn> {
  const res = await fetchWithTimeout(
    `${config.apiBaseUrl}${config.chatPath}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        message: req.prompt,
        model: config.agentModel,
        effort: config.effort,
        viewContext: { id: 'dashboard', label: 'Dashboard' },
        canvasState: { mode: 'free', elements: [], totalElements: 0 },
      }),
    },
    config.timeoutMs,
  );
  if (!res.ok) throw new Error(`/chat/stream ${res.status}: ${await res.text()}`);
  return extractAgentTurn(await res.text());
}

// Pide al juez LLM las notas de la composición vía el gateway OpenAI-compatible.
export async function judgeComposition(
  config: EvalLiveConfig,
  req: EvalRequest,
  ops: readonly CanvasOp[],
): Promise<Record<string, number>> {
  const { system, user } = buildJudgePrompt(req, ops);
  const res = await fetchWithTimeout(
    `${config.judge.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.judge.apiKey}`,
      },
      body: JSON.stringify({
        model: config.judge.model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    },
    config.timeoutMs,
  );
  if (!res.ok) throw new Error(`juez ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content ?? '';
  return parseJudgeScores(content);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ¿El error es transitorio y conviene reintentar? Cubre rate-limit (429/TPM) y sobrecarga del
// proveedor (503/overload/«workers busy»/«retry later») — los tiers gratuitos los devuelven a menudo.
export function isRateLimited(message: string): boolean {
  return /\b429\b|\b503\b|rate.?limit|tokens per minute|TPM|resourceexhausted|overloaded|service unavailable|workers are busy|retry later/i.test(
    message,
  );
}

// Extrae el «try again in Xs» del mensaje del proveedor (ms); por defecto 20s (sobrecarga 503 sin
// pista de tiempo; los rate-limit de tokens sí traen el tiempo en el mensaje y se respeta).
export function retryAfterMs(message: string, fallbackMs = 20_000): number {
  const m = message.match(/try again in ([\d.]+)\s*s/i);
  return m ? Math.ceil(parseFloat(m[1]!) * 1000) + 1_000 : fallbackMs;
}

// Ejecuta `fn` reintentando ante rate-limit: espera lo que pida el proveedor y reintenta hasta
// `maxRetries`. Cualquier otro error se propaga inmediatamente.
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  log: (msg: string) => void,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt >= maxRetries || !isRateLimited(message)) throw err;
      const wait = retryAfterMs(message);
      log(
        `   ⏳ rate-limit; espero ${Math.round(wait / 1000)}s y reintento (${attempt + 1}/${maxRetries})`,
      );
      await sleep(wait);
    }
  }
}

// Orquesta el arnés completo sobre `EVAL_REQUESTS`. Una petición que falle (red/juez) entra como
// resultado inválido con `error`, para no abortar la tanda y que el resumen lo refleje. Pausa
// `requestDelayMs` entre peticiones y reintenta ante rate-limit (`maxRetries`) para tiers gratuitos.
export async function runEvalSuite(
  config: EvalLiveConfig,
  requests: readonly EvalRequest[] = EVAL_REQUESTS,
  log: (msg: string) => void = () => {},
): Promise<EvalSummary> {
  const results: EvalResult[] = [];
  let first = true;
  for (const req of requests) {
    if (!first && config.requestDelayMs > 0) await sleep(config.requestDelayMs);
    first = false;
    log(`▶ ${req.id}: ${req.prompt}`);
    try {
      const turn = await withRetry(() => runAgentTurn(config, req), config.maxRetries, log);
      if (turn.error) throw new Error(turn.error);
      const report = validateComposition(turn.ops);
      const hitsExpected = compositionHits(turn.ops, req.expectsAnyOf);
      const scores = report.valid
        ? await withRetry(() => judgeComposition(config, req, turn.ops), config.maxRetries, log)
        : {};
      const meanScore = meanOfScores(scores);
      results.push({
        id: req.id,
        intent: req.intent,
        valid: report.valid,
        violations: report.violations,
        widgetCount: report.widgetCount,
        hitsExpected,
        toolCalls: turn.toolCalls,
        scores,
        meanScore,
      });
      log(
        `   valid=${report.valid} hits=${hitsExpected} toolCalls=${turn.toolCalls} score=${meanScore.toFixed(1)}`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log(`   ✗ ${message}`);
      results.push({
        id: req.id,
        intent: req.intent,
        valid: false,
        violations: [],
        widgetCount: 0,
        hitsExpected: false,
        toolCalls: 0,
        scores: {},
        meanScore: 0,
        error: message,
      });
    }
  }
  return aggregate(results);
}

export interface NegativeResult {
  id: string;
  composed: boolean;
  ok: boolean;
  toolCalls: number;
  error?: string;
}
export interface NegativeSummary {
  total: number;
  passed: number;
  results: NegativeResult[];
}

// Gate de casos NEGATIVOS (Anthropic: "test ... where it shouldn't"): ejecuta cada petición que NO
// debe componer y verifica `hasDataComposition === false`. Reutiliza `runAgentTurn` (solo usa el
// prompt). Una buena tanda exige passed === total.
export async function runNegativeSuite(
  config: EvalLiveConfig,
  requests: readonly NegativeEvalRequest[] = EVAL_NEGATIVE_REQUESTS,
  log: (msg: string) => void = () => {},
): Promise<NegativeSummary> {
  const results: NegativeResult[] = [];
  let first = true;
  for (const neg of requests) {
    if (!first && config.requestDelayMs > 0) await sleep(config.requestDelayMs);
    first = false;
    log(`▷ ${neg.id}: ${neg.prompt}`);
    try {
      const turn = await withRetry(
        () => runAgentTurn(config, { ...neg, expectsAnyOf: [] }),
        config.maxRetries,
        log,
      );
      if (turn.error) throw new Error(turn.error);
      const composed = hasDataComposition(turn.ops);
      results.push({ id: neg.id, composed, ok: !composed, toolCalls: turn.toolCalls });
      log(`   composed=${composed} ok=${!composed}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log(`   ✗ ${message}`);
      results.push({ id: neg.id, composed: false, ok: false, toolCalls: 0, error: message });
    }
  }
  return { total: results.length, passed: results.filter((r) => r.ok).length, results };
}

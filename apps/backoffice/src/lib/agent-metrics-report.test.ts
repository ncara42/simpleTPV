import { describe, expect, it } from 'vitest';

import {
  parseMetricsLog,
  renderComparison,
  renderMarkdown,
  summarize,
} from './agent-metrics-report.js';

// Formato por defecto fmt::layer() (logfmt-ish). El target aparece como `chat_metrics:`.
const LOGFMT = [
  '2026-06-23T10:00:00Z  INFO chat_metrics: agent turn finished event="turn" conversation=c1 tool_rounds=2 tool_calls=3 canvas_ops=1 view_actions=0 data_tools=2 hit_round_limit=false',
  '2026-06-23T10:00:01Z  INFO chat_metrics: agent turn finished event="turn" conversation=c2 tool_rounds=4 tool_calls=5 canvas_ops=2 view_actions=0 data_tools=3 hit_round_limit=true',
  '2026-06-23T10:00:02Z  INFO chat_metrics: canvas result event="canvas_result" conversation=c1 accepted=true rejected=false repaired=true',
  '2026-06-23T10:00:03Z  INFO chat_metrics: canvas result event="canvas_result" conversation=c1 accepted=false rejected=true repaired=false',
  '2026-06-23T10:00:04Z  INFO some_other_target: ruido que se ignora foo=bar tool_rounds=99',
  '',
].join('\n');

// Formato JSON (.json()): campos bajo `fields`.
const JSONL = [
  JSON.stringify({
    target: 'chat_metrics',
    fields: {
      event: 'turn',
      tool_rounds: 6,
      tool_calls: 7,
      canvas_ops: 0,
      view_actions: 0,
      data_tools: 1,
      hit_round_limit: false,
    },
  }),
  JSON.stringify({
    target: 'chat_metrics',
    fields: { event: 'canvas_result', accepted: true, rejected: false, repaired: false },
  }),
].join('\n');

// Formato real de fmt::layer() con colores ANSI (ESC[..m entre clave y `=`), tal cual lo escribe el
// API a fichero. El parser debe quitar los códigos ANSI antes de extraer los campos.
const E = String.fromCharCode(27);
const ANSI_LINE =
  `2026-06-23T00:46:12Z ${E}[32m INFO${E}[0m ${E}[2mchat_metrics${E}[0m${E}[2m:${E}[0m ` +
  `agent turn finished ${E}[3mevent${E}[0m${E}[2m=${E}[0m"turn" ` +
  `${E}[3mtool_rounds${E}[0m${E}[2m=${E}[0m1 ${E}[3mtool_calls${E}[0m${E}[2m=${E}[0m2 ` +
  `${E}[3mcanvas_ops${E}[0m${E}[2m=${E}[0m1 ${E}[3mview_actions${E}[0m${E}[2m=${E}[0m0 ` +
  `${E}[3mdata_tools${E}[0m${E}[2m=${E}[0m0 ${E}[3mhit_round_limit${E}[0m${E}[2m=${E}[0mfalse`;

describe('parseMetricsLog', () => {
  it('parsea el formato fmt::layer() con colores ANSI', () => {
    const log = parseMetricsLog(ANSI_LINE);
    expect(log.turns).toHaveLength(1);
    expect(log.turns[0]).toEqual({
      toolRounds: 1,
      toolCalls: 2,
      canvasOps: 1,
      viewActions: 0,
      dataTools: 0,
      hitRoundLimit: false,
    });
  });

  it('parsea logfmt e ignora otros targets', () => {
    const log = parseMetricsLog(LOGFMT);
    expect(log.turns).toHaveLength(2);
    expect(log.turns[0]).toEqual({
      toolRounds: 2,
      toolCalls: 3,
      canvasOps: 1,
      viewActions: 0,
      dataTools: 2,
      hitRoundLimit: false,
    });
    expect(log.turns[1]!.hitRoundLimit).toBe(true);
    expect(log.canvas).toHaveLength(2);
    expect(log.canvas[1]).toEqual({ accepted: false, rejected: true, repaired: false });
  });

  it('parsea JSON con campos anidados en fields', () => {
    const log = parseMetricsLog(JSONL);
    expect(log.turns[0]!.toolRounds).toBe(6);
    expect(log.canvas[0]).toEqual({ accepted: true, rejected: false, repaired: false });
  });

  it('deriva rejected de !accepted si el campo no viene', () => {
    const log = parseMetricsLog('chat_metrics: x accepted=false repaired=false');
    expect(log.canvas[0]!.rejected).toBe(true);
  });
});

describe('summarize', () => {
  it('calcula medias y tasas', () => {
    const s = summarize(parseMetricsLog(LOGFMT));
    expect(s.turnCount).toBe(2);
    expect(s.meanToolRounds).toBe(3); // (2+4)/2
    expect(s.meanToolCalls).toBe(4); // (3+5)/2
    expect(s.hitRoundLimitRatePct).toBe(50); // 1 de 2
    expect(s.canvasCount).toBe(2);
    expect(s.rejectedRatePct).toBe(50); // 1 de 2 = respuesta vacía
    expect(s.repairedRatePct).toBe(50);
    expect(s.acceptedRatePct).toBe(50);
  });

  it('no divide por cero con muestra vacía', () => {
    const s = summarize({ turns: [], canvas: [] });
    expect(s.meanToolRounds).toBe(0);
    expect(s.rejectedRatePct).toBe(0);
  });
});

describe('render', () => {
  it('renderMarkdown incluye las métricas clave', () => {
    const md = renderMarkdown(summarize(parseMetricsLog(LOGFMT)), 'post-v2');
    expect(md).toContain('### post-v2');
    expect(md).toContain('respuestas vacías');
    expect(md).toContain('| Turnos | 2 |');
  });

  it('renderComparison muestra el delta con signo', () => {
    const before = summarize(parseMetricsLog(LOGFMT));
    const after = summarize({ turns: [], canvas: [] });
    const md = renderComparison(before, after);
    expect(md).toContain('Comparativa antes/después');
    expect(md).toContain('-3'); // tool_rounds 3 → 0
  });
});

import { describe, expect, it } from 'vitest';

import { EVAL_REQUESTS } from './agent-eval-harness.js';
import {
  aggregate,
  buildJudgePrompt,
  compositionHits,
  evalConfigFromEnv,
  type EvalResult,
  extractAgentTurn,
  isRateLimited,
  meanOfScores,
  parseJudgeScores,
  parseSse,
  retryAfterMs,
  RUBRIC_KEYS,
} from './agent-eval-live.js';
import type { CanvasOp } from './chat.js';

function sse(...blocks: Array<{ event: string; data: unknown }>): string {
  return (
    blocks.map((b) => `event: ${b.event}\ndata: ${JSON.stringify(b.data)}`).join('\n\n') + '\n\n'
  );
}

describe('parseSse', () => {
  it('parsea bloques event/data y descarta ping y malformados', () => {
    const text =
      'event: ping\ndata: {}\n\n' +
      'event: token\ndata: {"text":"hola"}\n\n' +
      'event: bad\ndata: {no-json}\n\n';
    const recs = parseSse(text);
    expect(recs).toEqual([{ event: 'token', data: { text: 'hola' } }]);
  });
});

describe('extractAgentTurn', () => {
  it('reduce el SSE a ops, recuentos, conversationId y texto', () => {
    const text = sse(
      { event: 'token', data: { text: 'Aquí ' } },
      { event: 'token', data: { text: 'tienes' } },
      { event: 'tool_call', data: { id: '1', name: 'sales_kpis', args: {} } },
      {
        event: 'canvas_op',
        data: { toolCallId: '2', op: { op: 'add_widget', widgetId: 'block:sales-overview' } },
      },
      { event: 'view_action', data: { toolCallId: '3', action: 'highlight_on_view', args: {} } },
      { event: 'done', data: { messageId: 'm1', conversationId: 'c9', usage: {} } },
    );
    const turn = extractAgentTurn(text);
    expect(turn.ops).toEqual([{ op: 'add_widget', widgetId: 'block:sales-overview' }]);
    expect(turn.toolCalls).toBe(1);
    expect(turn.viewActions).toBe(1);
    expect(turn.conversationId).toBe('c9');
    expect(turn.text).toBe('Aquí tienes');
    expect(turn.error).toBeUndefined();
  });

  it('captura el evento error', () => {
    const turn = extractAgentTurn(sse({ event: 'error', data: { message: 'boom' } }));
    expect(turn.error).toBe('boom');
  });
});

describe('compositionHits', () => {
  const block: CanvasOp = { op: 'add_widget', widgetId: 'block:store-comparison' };
  const panel: CanvasOp = {
    op: 'add_widget',
    widgetId: 'gen:panel',
    genericSpec: {
      slots: { charts: [{ piece: 'comparisonBars', endpoint: '/dashboard/sales-by-store' }] },
    },
  };

  it('acierta por widgetId de bloque', () => {
    expect(compositionHits([block], ['block:store-comparison'])).toBe(true);
  });
  it('acierta por endpoint dentro de un gen:panel', () => {
    expect(compositionHits([panel], ['/dashboard/sales-by-store'])).toBe(true);
  });
  it('falla si no toca ninguno de los esperados', () => {
    expect(compositionHits([block], ['/dashboard/sales-by-hour'])).toBe(false);
  });
  it('es laxo cuando no se esperaba nada', () => {
    expect(compositionHits([], [])).toBe(true);
  });
});

describe('buildJudgePrompt', () => {
  it('incluye intención, rúbrica y la composición serializada', () => {
    const req = EVAL_REQUESTS[0]!;
    const ops: CanvasOp[] = [{ op: 'add_widget', widgetId: 'block:sales-overview' }];
    const { system, user } = buildJudgePrompt(req, ops);
    expect(system).toMatch(/JSON/);
    expect(user).toContain(req.intent);
    for (const key of RUBRIC_KEYS) expect(user).toContain(key);
    expect(user).toContain('block:sales-overview');
  });
});

describe('parseJudgeScores', () => {
  it('parsea JSON plano con todas las dimensiones', () => {
    const raw =
      '{"coherencia":9,"jerarquia":8,"anti-saturacion":10,"fidelidad":8,"comentario":"ok"}';
    expect(parseJudgeScores(raw)).toEqual({
      coherencia: 9,
      jerarquia: 8,
      'anti-saturacion': 10,
      fidelidad: 8,
    });
  });
  it('tolera fences ```json', () => {
    const raw = '```json\n{"coherencia":7,"jerarquia":7,"anti-saturacion":7,"fidelidad":7}\n```';
    expect(parseJudgeScores(raw).coherencia).toBe(7);
  });
  it('lanza si falta una dimensión o está fuera de 0–10', () => {
    expect(() => parseJudgeScores('{"coherencia":9}')).toThrow();
    expect(() =>
      parseJudgeScores('{"coherencia":11,"jerarquia":8,"anti-saturacion":8,"fidelidad":8}'),
    ).toThrow();
  });
});

describe('meanOfScores', () => {
  it('promedia las notas', () => {
    expect(meanOfScores({ a: 8, b: 10 })).toBe(9);
    expect(meanOfScores({})).toBe(0);
  });
});

describe('aggregate', () => {
  const base = {
    intent: '',
    violations: [],
    widgetCount: 1,
    hitsExpected: true,
    toolCalls: 1,
  };
  it('calcula validPct, meanScore y pass contra el umbral', () => {
    const results: EvalResult[] = [
      { id: 'a', ...base, valid: true, scores: { x: 9, y: 9 }, meanScore: 9 },
      { id: 'b', ...base, valid: true, scores: { x: 8, y: 8 }, meanScore: 8 },
    ];
    const sum = aggregate(results);
    expect(sum.validPct).toBe(100);
    expect(sum.meanScore).toBe(8.5);
    expect(sum.hitRatePct).toBe(100);
    expect(sum.pass).toBe(true);
  });
  it('no pasa si alguna composición es inválida (valid<100 %)', () => {
    const results: EvalResult[] = [
      { id: 'a', ...base, valid: true, scores: { x: 10 }, meanScore: 10 },
      { id: 'b', ...base, valid: false, scores: {}, meanScore: 0, hitsExpected: false },
    ];
    expect(aggregate(results).pass).toBe(false);
  });
  it('no pasa si el score medio baja de 8', () => {
    const results: EvalResult[] = [
      { id: 'a', ...base, valid: true, scores: { x: 7 }, meanScore: 7 },
    ];
    expect(aggregate(results).pass).toBe(false);
  });
});

describe('rate-limit helpers', () => {
  it('isRateLimited detecta 429 / TPM y sobrecarga 503', () => {
    expect(isRateLimited('Provider error 429: rate_limit_exceeded')).toBe(true);
    expect(isRateLimited('tokens per minute (TPM): Limit 12000')).toBe(true);
    expect(isRateLimited('Provider error 503: ResourceExhausted: All workers are busy')).toBe(true);
    expect(isRateLimited('Error 500 interno')).toBe(false);
  });
  it('retryAfterMs lee "try again in Xs" (+margen) o usa fallback', () => {
    expect(retryAfterMs('Please try again in 20.5s.')).toBe(21_500);
    expect(retryAfterMs('sin pista', 60_000)).toBe(60_000);
  });
});

describe('evalConfigFromEnv', () => {
  it('reporta las variables que faltan', () => {
    const res = evalConfigFromEnv({});
    expect('missing' in res && res.missing).toContain('EVAL_API_URL');
  });
  it('construye la config cuando están todas', () => {
    const res = evalConfigFromEnv({
      EVAL_API_URL: 'http://localhost:3001/',
      EVAL_TOKEN: 'jwt',
      EVAL_AGENT_MODEL: 'cheap-model',
      EVAL_JUDGE_MODEL: 'judge-model',
      OPENAI_BASE_URL: 'https://gw/v1/',
      OPENAI_API_KEY: 'sk',
    });
    expect('config' in res).toBe(true);
    if ('config' in res) {
      expect(res.config.apiBaseUrl).toBe('http://localhost:3001'); // barra final recortada
      expect(res.config.judge.baseUrl).toBe('https://gw/v1');
      expect(res.config.effort).toBe('low');
    }
  });
});

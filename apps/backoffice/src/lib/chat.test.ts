import { beforeEach, describe, expect, it, vi } from 'vitest';

// El dispatcher de streamChat envuelve api.postStream; lo mockeamos para
// invocar el callback de eventos sin red real.
const postStream = vi.fn();
vi.mock('./auth.js', () => ({
  api: {
    postStream: (...args: unknown[]) => postStream(...args),
  },
}));

import {
  autoTitle,
  type CanvasOpEvent,
  type DoneEvent,
  type ErrorEvent,
  streamChat,
  type TokenEvent,
  type ToolCallEvent,
} from './chat.js';

describe('autoTitle', () => {
  it('toma ~6 palabras significativas y capitaliza la primera', () => {
    const t = autoTitle('Quiero ver las últimas ventas del mes');
    // 'las' y 'del' son stop words; 'ver'/'mes' superan 2 caracteres y se mantienen.
    expect(t).toBe('Quiero ver últimas ventas mes');
  });

  it('descarta palabras de 2 caracteres o menos y signos de puntuación', () => {
    const t = autoTitle('¿Me das el TOP 3 de productos?');
    // 'me'(stop), 'das'(keep), 'el'(stop), 'top'(keep), '3'(<=2 desc.), 'de'(stop), 'productos'(keep)
    expect(t).toBe('Das top productos');
  });

  it('limita el título a 6 palabras', () => {
    const t = autoTitle('mostrar grafico ventas margen rotacion stock proveedores familias');
    expect(t.split(' ')).toHaveLength(6);
    expect(t).toBe('Mostrar grafico ventas margen rotacion stock');
  });

  it('cae a marca de tiempo cuando no quedan palabras significativas', () => {
    const now = new Date(2026, 5, 20, 14, 30);
    const t = autoTitle('de la en el y o', now);
    // Formato es-ES con fecha y hora — no debe contener las stop words del input.
    expect(t).toMatch(/\d{1,2}\/\d{1,2}.*\d{1,2}:\d{2}/);
    expect(t).toBe(
      now.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
  });
});

describe('streamChat dispatcher', () => {
  beforeEach(() => {
    postStream.mockReset();
  });

  it('enruta cada tipo de evento SSE al callback correcto', async () => {
    const token: TokenEvent = { text: 'hola' };
    const toolCall: ToolCallEvent = { id: 'tc1', name: 'sales_kpis', args: { period: 'today' } };
    const canvasOp: CanvasOpEvent = {
      toolCallId: 'tc2',
      op: { op: 'add_widget', widgetId: 'kpi-today', elementId: 'e1' },
    };
    const done: DoneEvent = {
      messageId: 'm1',
      conversationId: 'c1',
      usage: { inputTokens: 10, outputTokens: 5, costEur: '0.0001' },
    };

    // Mock: reproduce la secuencia de eventos sobre el callback (eventType, data).
    postStream.mockImplementation(
      async (
        _path: string,
        _params: unknown,
        onEvent: (eventType: string, data: unknown) => void,
      ) => {
        onEvent('token', token);
        onEvent('tool_call', toolCall);
        onEvent('canvas_op', canvasOp);
        onEvent('done', done);
      },
    );

    const onToken = vi.fn();
    const onToolCall = vi.fn();
    const onCanvasOp = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await streamChat(
      { message: 'hola', model: 'gpt-4.1', effort: 'low' },
      { onToken, onToolCall, onCanvasOp, onDone, onError },
    );

    expect(onToken).toHaveBeenCalledWith(token);
    expect(onToolCall).toHaveBeenCalledWith(toolCall);
    expect(onCanvasOp).toHaveBeenCalledWith(canvasOp);
    expect(onDone).toHaveBeenCalledWith(done);
    expect(onError).not.toHaveBeenCalled();
  });

  it('enruta view_action a onViewAction', async () => {
    const viewAction = {
      toolCallId: 'tc3',
      action: 'highlight_on_view' as const,
      args: { target: 'SKU' },
    };
    postStream.mockImplementation(
      async (_p: string, _q: unknown, onEvent: (t: string, d: unknown) => void) => {
        onEvent('view_action', viewAction);
      },
    );
    const onViewAction = vi.fn();
    await streamChat({ message: 'x', model: 'gpt-4.1', effort: 'low' }, { onViewAction });
    expect(onViewAction).toHaveBeenCalledWith(viewAction);
  });

  it('reenvía el evento error a onError', async () => {
    const err: ErrorEvent = { message: 'modelo no disponible' };
    postStream.mockImplementation(
      async (_p: string, _q: unknown, onEvent: (t: string, d: unknown) => void) => {
        onEvent('error', err);
      },
    );

    const onError = vi.fn();
    await streamChat({ message: 'x', model: 'gpt-4.1', effort: 'low' }, { onError });
    expect(onError).toHaveBeenCalledWith(err);
  });

  it('ignora tipos de evento desconocidos sin lanzar', async () => {
    postStream.mockImplementation(
      async (_p: string, _q: unknown, onEvent: (t: string, d: unknown) => void) => {
        onEvent('desconocido', {});
      },
    );
    const onToken = vi.fn();
    await expect(
      streamChat({ message: 'x', model: 'gpt-4.1', effort: 'low' }, { onToken }),
    ).resolves.toBeUndefined();
    expect(onToken).not.toHaveBeenCalled();
  });

  it('propaga la señal de abort a postStream', async () => {
    postStream.mockResolvedValue(undefined);
    const controller = new AbortController();
    await streamChat({ message: 'x', model: 'gpt-4.1', effort: 'low' }, {}, controller.signal);
    // Cuarto argumento de postStream = signal.
    expect(postStream.mock.calls[0]?.[3]).toBe(controller.signal);
  });
});

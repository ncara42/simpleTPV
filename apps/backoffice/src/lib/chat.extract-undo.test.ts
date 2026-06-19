import { describe, expect, it } from 'vitest';

import { type ChatMessage, extractUndoableCanvasOps } from './chat.js';

function assistantWithCalls(
  id: string,
  calls: { id: string; name: string; args: unknown }[],
): ChatMessage {
  return {
    id,
    conversationId: 'c1',
    role: 'assistant',
    content: [{ type: 'text', text: '' }],
    toolCalls: calls,
    toolResults: null,
    createdAt: '2026-06-20T00:00:00.000Z',
  };
}

describe('extractUndoableCanvasOps', () => {
  it('extrae solo las ops add_* de los mensajes del asistente', () => {
    const messages: ChatMessage[] = [
      assistantWithCalls('m1', [
        { id: 't1', name: 'add_widget', args: { op: 'add_widget', widgetId: 'sales' } },
        { id: 't2', name: 'sales_kpis', args: { period: 'month' } },
        { id: 't3', name: 'remove_element', args: { op: 'remove_element', elementId: 'x' } },
      ]),
    ];

    const ops = extractUndoableCanvasOps(messages);

    expect(ops).toHaveLength(1);
    expect(ops[0]?.op).toBe('add_widget');
  });

  it('ignora mensajes de usuario y tool', () => {
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        conversationId: 'c1',
        role: 'user',
        content: [{ type: 'text', text: 'hola' }],
        toolCalls: null,
        toolResults: null,
        createdAt: '2026-06-20T00:00:00.000Z',
      },
    ];

    expect(extractUndoableCanvasOps(messages)).toEqual([]);
  });

  it('acumula ops a lo largo de varios turnos', () => {
    const messages: ChatMessage[] = [
      assistantWithCalls('m1', [
        { id: 't1', name: 'add_note', args: { op: 'add_note', text: 'nota' } },
      ]),
      assistantWithCalls('m2', [
        { id: 't2', name: 'add_shape', args: { op: 'add_shape', kind: 'arrow' } },
      ]),
    ];

    expect(extractUndoableCanvasOps(messages).map((o) => o.op)).toEqual(['add_note', 'add_shape']);
  });
});

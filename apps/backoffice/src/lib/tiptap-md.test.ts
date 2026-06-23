import { describe, expect, it } from 'vitest';

import { markdownToTiptapDoc } from './tiptap-md.js';

describe('markdownToTiptapDoc', () => {
  it('devuelve un doc válido con un párrafo vacío para entrada vacía', () => {
    const doc = markdownToTiptapDoc('');
    expect(doc.type).toBe('doc');
    expect(doc.content).toEqual([{ type: 'paragraph' }]);
  });

  it('convierte un párrafo simple', () => {
    const doc = markdownToTiptapDoc('Las ventas suben este mes.');
    expect(doc.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Las ventas suben este mes.' }],
    });
  });

  it('aplica negrita y cursiva inline', () => {
    const doc = markdownToTiptapDoc('Sube un **12 %** frente a *mayo*.');
    const para = doc.content[0]!;
    expect(para.type).toBe('paragraph');
    const marks = (para.content ?? []).flatMap((n) => n.marks?.map((mk) => mk.type) ?? []);
    expect(marks).toContain('bold');
    expect(marks).toContain('italic');
    // el texto se conserva (sin los asteriscos)
    expect(JSON.stringify(para)).toContain('12 %');
    expect(JSON.stringify(para)).not.toContain('**');
  });

  it('convierte una lista con viñetas', () => {
    const doc = markdownToTiptapDoc('- Sur lidera\n- Online cae');
    expect(doc.content[0]!.type).toBe('bulletList');
    expect(doc.content[0]!.content).toHaveLength(2);
    expect(doc.content[0]!.content![0]!.type).toBe('listItem');
  });

  it('convierte una lista numerada', () => {
    const doc = markdownToTiptapDoc('1. Primero\n2. Segundo');
    expect(doc.content[0]!.type).toBe('orderedList');
    expect(doc.content[0]!.content).toHaveLength(2);
  });

  it('convierte encabezados', () => {
    const doc = markdownToTiptapDoc('## Resumen');
    expect(doc.content[0]!.type).toBe('heading');
    expect(doc.content[0]!.attrs).toEqual({ level: 2 });
  });

  it('mezcla título en negrita + párrafo (forma típica del insight)', () => {
    const doc = markdownToTiptapDoc('**Ventas al alza**\n\nLa facturación sube un 12 %.');
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0]!.type).toBe('paragraph');
    expect(doc.content[1]!.type).toBe('paragraph');
    const firstMarks = (doc.content[0]!.content ?? []).flatMap((n) => n.marks ?? []);
    expect(firstMarks.some((mk) => mk.type === 'bold')).toBe(true);
  });
});

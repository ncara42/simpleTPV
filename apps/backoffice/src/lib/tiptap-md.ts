// Conversor ligero markdown → documento ProseMirror/TipTap (StarterKit), para volcar el texto
// que envía el agente (insights/notas) dentro de una nota EDITABLE. Cubre lo que el agente emite:
// párrafos, negrita (**), cursiva (* o _), listas con viñetas (- / *) y numeradas (1.), y
// encabezados (#..###). No pretende ser un parser markdown completo: lo desconocido cae a texto.
// El resultado es JSON válido del schema de StarterKit (doc>block>inline) → rehidratación segura.

interface PMNode {
  type: string;
  text?: string;
  marks?: Array<{ type: string }>;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
}

export interface TiptapDoc {
  type: 'doc';
  content: PMNode[];
}

const BULLET = /^\s*[-*]\s+/;
const ORDERED = /^\s*\d+\.\s+/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const INLINE = /\*\*([^*]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_/g;

/** Trocea una línea en nodos de texto con marcas (negrita/cursiva). Filtra texto vacío. */
function parseInline(text: string): PMNode[] {
  const nodes: PMNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) {
      const plain = text.slice(last, m.index);
      if (plain) nodes.push({ type: 'text', text: plain });
    }
    if (m[1] != null) nodes.push({ type: 'text', text: m[1], marks: [{ type: 'bold' }] });
    else if (m[2] != null) nodes.push({ type: 'text', text: m[2], marks: [{ type: 'italic' }] });
    else if (m[3] != null) nodes.push({ type: 'text', text: m[3], marks: [{ type: 'italic' }] });
    last = INLINE.lastIndex;
  }
  if (last < text.length) {
    const tail = text.slice(last);
    if (tail) nodes.push({ type: 'text', text: tail });
  }
  return nodes;
}

/** Párrafo (omite `content` si queda vacío → párrafo vacío válido en ProseMirror). */
function paragraph(text: string): PMNode {
  const inline = parseInline(text);
  return inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' };
}

function listItem(text: string): PMNode {
  return { type: 'listItem', content: [paragraph(text)] };
}

/**
 * Convierte markdown a un documento TipTap (StarterKit). Siempre devuelve un doc válido con al
 * menos un bloque (un párrafo vacío si la entrada está vacía).
 */
export function markdownToTiptapDoc(md: string): TiptapDoc {
  const src = (md ?? '').replace(/\r\n/g, '\n').trim();
  if (!src) return { type: 'doc', content: [{ type: 'paragraph' }] };

  // `lines[i]` está siempre dentro de rango bajo `i < lines.length` (de ahí los `!`).
  const lines = src.split('\n');
  const content: PMNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (BULLET.test(line)) {
      const items: PMNode[] = [];
      while (i < lines.length && BULLET.test(lines[i]!)) {
        items.push(listItem(lines[i]!.replace(BULLET, '')));
        i++;
      }
      content.push({ type: 'bulletList', content: items });
      continue;
    }
    if (ORDERED.test(line)) {
      const items: PMNode[] = [];
      while (i < lines.length && ORDERED.test(lines[i]!)) {
        items.push(listItem(lines[i]!.replace(ORDERED, '')));
        i++;
      }
      content.push({ type: 'orderedList', content: items });
      continue;
    }
    const h = line.match(HEADING);
    if (h) {
      content.push({
        type: 'heading',
        attrs: { level: h[1]!.length },
        content: parseInline(h[2]!),
      });
      i++;
      continue;
    }
    // Párrafo: junta líneas consecutivas que no abren otro bloque.
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !BULLET.test(lines[i]!) &&
      !ORDERED.test(lines[i]!) &&
      !HEADING.test(lines[i]!)
    ) {
      buf.push(lines[i]!.trim());
      i++;
    }
    content.push(paragraph(buf.join(' ')));
  }

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

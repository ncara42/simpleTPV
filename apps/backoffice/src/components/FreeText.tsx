import { useEffect, useRef } from 'react';

import type { FreeText as FreeTextEl } from '../lib/dashboard-layout.js';

export interface FreeTextProps {
  el: FreeTextEl;
  /** En edición: textarea editable; si no, texto estático (inerte para poder arrastrar). */
  editing: boolean;
  onChange: (text: string) => void;
  onBlur: () => void;
}

// Texto libre del lienzo: una cadena plana colocable en cualquier sitio (sin caja/fondo de
// nota). Edita con doble clic; al salir se persiste (y se descarta si queda vacío).
export function FreeText({ el, editing, onChange, onBlur }: FreeTextProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      const node = ref.current;
      node.focus();
      node.setSelectionRange(node.value.length, node.value.length);
    }
  }, [editing]);

  const style = { color: el.color, fontSize: el.fontSize };

  if (editing) {
    return (
      <textarea
        ref={ref}
        className="dash-free-text-input"
        style={style}
        value={el.text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder="Escribe…"
        aria-label="Texto libre"
      />
    );
  }

  return (
    <div className="dash-free-text-view" style={style}>
      {el.text || <span className="dash-free-text-placeholder">Texto</span>}
    </div>
  );
}

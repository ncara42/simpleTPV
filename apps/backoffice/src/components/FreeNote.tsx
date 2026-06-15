import { lazy, Suspense } from 'react';

const NoteEditor = lazy(() => import('./NoteEditor.js'));

export interface FreeNoteProps {
  doc: unknown;
  onChange: (doc: unknown) => void;
}

// Cuerpo de una nota del lienzo: límite de carga diferida del editor TipTap. La cromática
// (cabecera arrastrable, color, quitar) la pone FreeBoard alrededor; aquí solo va el editor.
export function FreeNote({ doc, onChange }: FreeNoteProps) {
  return (
    <Suspense fallback={<div className="dash-free-note-loading">Cargando editor…</div>}>
      <NoteEditor doc={doc} onChange={onChange} />
    </Suspense>
  );
}

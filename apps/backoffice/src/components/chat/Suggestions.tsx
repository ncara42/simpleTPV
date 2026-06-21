import { type PointerEvent as ReactPointerEvent, type ReactNode, useRef } from 'react';

interface SuggestionsProps {
  children: ReactNode;
}

const DRAG_THRESHOLD = 4; // px para distinguir arrastre de click

/**
 * Fila de sugerencias en UNA línea con scroll horizontal (slider), estilo ScrollArea de
 * ai-elements. Sin barra de scroll visible y arrastrable a mano (pointer drag): al arrastrar se
 * suprime el click para no enviar el chip sin querer.
 */
export function Suggestions({ children }: SuggestionsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startLeft: 0, moved: false });

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const el = ref.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const el = ref.current;
    if (!el || !drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > DRAG_THRESHOLD) drag.current.moved = true;
    el.scrollLeft = drag.current.startLeft - dx;
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    drag.current.active = false;
    ref.current?.releasePointerCapture?.(e.pointerId);
  };

  // Tras un arrastre, anula el click que dispararía el chip.
  const onClickCapture = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  return (
    <div
      className="suggestions"
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
    >
      {children}
    </div>
  );
}

interface SuggestionProps {
  suggestion: string;
  onClick: (suggestion: string) => void;
}

/** Chip de sugerencia: al pulsarlo envía el prompt. */
export function Suggestion({ suggestion, onClick }: SuggestionProps) {
  return (
    <button type="button" className="suggestion" onClick={() => onClick(suggestion)}>
      {suggestion}
    </button>
  );
}

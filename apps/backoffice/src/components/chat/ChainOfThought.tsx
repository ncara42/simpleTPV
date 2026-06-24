import { Check, ChevronRight } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { ChatMarkdown } from './ChatMarkdown.js';
import { Shimmer } from './Shimmer.js';

/**
 * Un eslabón de la cadena de pensamiento de un turno:
 *  - `reasoning`  → bloque de razonamiento del modelo (markdown).
 *  - `narration`  → texto intermedio del asistente ("ahora consulto…"), que no es la conclusión.
 *  - `tool`       → un paso de herramienta (consulta de datos o acción sobre el lienzo/vista).
 */
export type ThoughtItem =
  | { kind: 'reasoning'; text: string }
  | { kind: 'narration'; text: string }
  | {
      kind: 'tool';
      label: string;
      /** Color semántico del nodo: consulta de datos (índigo) vs acción (marca). */
      variant: 'query' | 'action';
      status: 'running' | 'done' | 'rejected';
    };

interface ChainOfThoughtProps {
  items: ThoughtItem[];
  /** El turno está en curso: auto-abre, cabecera en shimmer y nodos en marcha. */
  isStreaming: boolean;
}

/**
 * Cadena de pensamiento de un turno (estilo chain-of-thought de ai-elements): UNA sola sección
 * desplegable —texto con flecha, NO una pill— que reúne TODO el proceso para llegar a la
 * respuesta: razonamiento del modelo, narración intermedia y cada paso de herramienta, en una
 * timeline. Sustituye a los antiguos bloques separados «Razonamiento» y «Proceso · N pasos», que
 * se repetían una vez por ronda del agente y generaban ruido visual. Se auto-abre mientras el
 * modelo trabaja y se pliega al terminar (el usuario puede desplegarla cuando quiera).
 */
export function ChainOfThought({ items, isStreaming }: ChainOfThoughtProps) {
  const [open, setOpen] = useState(isStreaming);
  const [duration, setDuration] = useState<number | null>(null);
  const startRef = useRef<number | null>(null);
  const wasStreaming = useRef(false);

  useEffect(() => {
    if (isStreaming && !wasStreaming.current) {
      startRef.current = performance.now();
      setOpen(true);
    } else if (!isStreaming && wasStreaming.current) {
      if (startRef.current != null) {
        setDuration(Math.max(1, Math.round((performance.now() - startRef.current) / 1000)));
      }
      setOpen(false);
    }
    wasStreaming.current = isStreaming;
  }, [isStreaming]);

  if (items.length === 0) return null;

  const stepCount = items.reduce((n, it) => (it.kind === 'tool' ? n + 1 : n), 0);
  const hasReasoning = items.some((it) => it.kind === 'reasoning' || it.kind === 'narration');

  let label: ReactNode;
  if (isStreaming) {
    label = <Shimmer>Pensando…</Shimmer>;
  } else {
    const parts: string[] = [];
    if (hasReasoning) parts.push(duration != null ? `Pensó ${duration} s` : 'Razonamiento');
    if (stepCount > 0) parts.push(`${stepCount} ${stepCount === 1 ? 'paso' : 'pasos'}`);
    label = parts.join(' · ') || 'Proceso';
  }

  return (
    <div className={`cot${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="cot__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="chat-chain-of-thought"
      >
        <span className="cot__label">{label}</span>
        <ChevronRight size={14} className="cot__caret" aria-hidden="true" />
      </button>
      {open && (
        <ol className="cot__steps">
          {items.map((item, i) =>
            item.kind === 'tool' ? (
              <li
                key={i}
                className={`cot__step cot__step--tool cot__step--${item.variant} is-${item.status}`}
              >
                <span className="cot__node" aria-hidden="true">
                  {item.status === 'done' ? <Check size={8} strokeWidth={3} /> : null}
                </span>
                <span className="cot__tool">{item.label}</span>
              </li>
            ) : (
              <li key={i} className={`cot__step cot__step--${item.kind}`}>
                <span className="cot__node cot__node--text" aria-hidden="true" />
                <div className="cot__text chat-markdown">
                  <ChatMarkdown>{item.text}</ChatMarkdown>
                </div>
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}

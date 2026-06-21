import { Brain, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ChatMarkdown } from './ChatMarkdown.js';
import { Shimmer } from './Shimmer.js';

interface ReasoningProps {
  /** Texto de razonamiento (markdown). */
  children: string;
  /** El modelo está produciendo razonamiento ahora mismo: auto-abre y muestra el shimmer. */
  isStreaming: boolean;
  /** Estado inicial cuando no hay streaming (historial → colapsado). */
  defaultOpen?: boolean;
}

/**
 * Bloque colapsable de razonamiento del modelo (estilo Reasoning de ai-elements): se auto-abre
 * mientras el modelo razona (con el header en shimmer) y se auto-cierra al terminar, mostrando la
 * duración ("Pensó durante Xs"). El usuario puede plegarlo/desplegarlo a mano después. Diseño claro.
 */
export function Reasoning({ children, isStreaming, defaultOpen }: ReasoningProps) {
  const [open, setOpen] = useState(defaultOpen ?? isStreaming);
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

  const label = isStreaming ? (
    <Shimmer>Razonando…</Shimmer>
  ) : duration != null ? (
    `Pensó durante ${duration} s`
  ) : (
    'Razonamiento'
  );

  return (
    <div className={`reasoning${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="reasoning__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="chat-reasoning"
      >
        <Brain size={14} aria-hidden="true" />
        <span className="reasoning__label">{label}</span>
        <ChevronDown size={14} className="reasoning__caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="reasoning__content chat-markdown">
          <ChatMarkdown>{children}</ChatMarkdown>
        </div>
      )}
    </div>
  );
}

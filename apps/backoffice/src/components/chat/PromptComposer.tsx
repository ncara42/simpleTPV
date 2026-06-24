import { ArrowUp, Loader2, Square } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useState } from 'react';

/** Estado del turno (espejo del `status` del PromptInput de ai-elements). */
export type ComposerStatus = 'ready' | 'submitted' | 'streaming';

interface PromptComposerProps {
  /** ready = listo para enviar; submitted = enviado, esperando; streaming = recibiendo. */
  status: ComposerStatus;
  disabled: boolean;
  queueLength: number;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Controles a la izquierda del pie (el menú «+» de herramientas del lienzo). */
  leading?: ReactNode;
  /** Controles a la derecha del pie, antes de enviar (selector de modelo/esfuerzo). */
  trailing?: ReactNode;
  placeholder?: string;
  /** Se invoca al enfocar el textarea (abre el popover de conversación). */
  onFocus?: () => void;
  /** Colapsado a píldora solo-input (fuera del dashboard, sin foco): oculta el pie y reduce. */
  collapsed?: boolean;
}

/**
 * Composer del asistente con la forma del PromptInput de ai-elements (Vercel AI Elements):
 * una superficie redondeada con el textarea autoexpandible arriba y un pie con las acciones.
 *
 * El morph colapsar/expandir se anima con CSS NATIVO sobre las propiedades REALES (`width`/`height`/
 * `border-radius`/`padding`) — no por escala/transform — para que el texto NO se deforme y el encoger
 * se vea natural. `interpolate-size: allow-keywords` permite interpolar el ancho intrínseco
 * (`fit-content`) y el alto `auto`. El pie sale de flujo (`position:absolute`) al colapsar para no
 * ensanchar la píldora, y se desvanece. Ver chat.css (`.prompt-input`, `.is-collapsed`).
 */
export function PromptComposer({
  status,
  disabled,
  queueLength,
  onSend,
  onStop,
  leading,
  trailing,
  placeholder = 'Pregunta al asistente o pídele que componga el dashboard…',
  onFocus,
  collapsed = false,
}: PromptComposerProps) {
  const [value, setValue] = useState('');
  const canSend = value.trim().length > 0 && !disabled;
  const busy = status !== 'ready';
  // Colapsado el hueco es mínimo: un placeholder breve evita que se corte de forma fea.
  const effectivePlaceholder = collapsed ? 'Tengo una pregunta' : placeholder;

  const submit = (): void => {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter envía; Shift+Enter inserta salto de línea.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      className={`prompt-input${disabled ? ' is-disabled' : ''}${collapsed ? ' is-collapsed' : ''}`}
      data-testid="chat-composer"
    >
      {queueLength > 0 && (
        <p className="prompt-input__queue" role="status">
          {queueLength === 1 ? '1 mensaje en cola' : `${queueLength} mensajes en cola`}
        </p>
      )}
      <textarea
        className="prompt-input__textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        placeholder={effectivePlaceholder}
        rows={Math.min(8, Math.max(1, value.split('\n').length))}
        disabled={disabled}
        data-testid="chat-input"
      />
      {/* Pie SIEMPRE montado: se pliega por CSS (sale de flujo + fade) cuando .is-collapsed. */}
      <div className="prompt-input__footer" aria-hidden={collapsed} inert={collapsed || undefined}>
        <div className="prompt-input__tools">{leading}</div>
        <div className="prompt-input__actions">
          {trailing}
          {busy ? (
            <button
              type="button"
              className="prompt-input__submit prompt-input__submit--stop"
              onClick={onStop}
              aria-label="Detener"
              title="Detener"
              data-testid="chat-stop"
            >
              {status === 'submitted' ? (
                <Loader2 size={16} className="prompt-input__spin" aria-hidden="true" />
              ) : (
                <Square size={15} aria-hidden="true" />
              )}
            </button>
          ) : (
            <button
              type="button"
              className="prompt-input__submit"
              onClick={submit}
              disabled={!canSend}
              aria-label="Enviar"
              title="Enviar"
              data-testid="chat-send"
            >
              <ArrowUp size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

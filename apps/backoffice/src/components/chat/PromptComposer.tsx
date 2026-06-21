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
}

/**
 * Composer del asistente con la forma del PromptInput de ai-elements (Vercel AI Elements):
 * una superficie redondeada con el textarea autoexpandible arriba y un pie con las acciones
 * — el slot `leading` («+») a la izquierda y el botón de enviar/parar a la derecha. Réplica
 * visual con los tokens del design system (sin shadcn); cableada al store propio del chat.
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
}: PromptComposerProps) {
  const [value, setValue] = useState('');
  const canSend = value.trim().length > 0 && !disabled;
  const busy = status !== 'ready';

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
    <div className={`prompt-input${disabled ? ' is-disabled' : ''}`} data-testid="chat-composer">
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
        placeholder={placeholder}
        rows={Math.min(8, Math.max(1, value.split('\n').length))}
        disabled={disabled}
        data-testid="chat-input"
      />
      <div className="prompt-input__footer">
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

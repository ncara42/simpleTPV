import { ArrowUp, Loader2, Mic, Square } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';

import { useSpeechRecognition } from './useSpeechRecognition.js';

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
  /** Se invoca al enfocar el textarea o al empezar a dictar (abre el popover de conversación). */
  onFocus?: () => void;
}

// Une el texto actual con una frase dictada respetando un único espacio (como al escribir).
function appendSpoken(current: string, spoken: string): string {
  if (!spoken) return current;
  if (!current.trim()) return spoken;
  return `${current.replace(/\s+$/, '')} ${spoken}`;
}

// Mensaje legible para los códigos de error del reconocimiento de voz.
function friendlyVoiceError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Micrófono bloqueado: permítelo en el navegador (icono de la barra de direcciones) y reintenta.';
    case 'network':
      return 'El reconocimiento de voz no responde (necesita conexión a internet).';
    case 'audio-capture':
      return 'No se detecta ningún micrófono.';
    case 'no-result':
      return 'No he captado nada. El dictado por voz no es fiable en Safari — prueba en Chrome o Edge.';
    default:
      return `No se pudo dictar (${code}). Prueba en Chrome/Edge o escribe el mensaje.`;
  }
}

/**
 * Composer del asistente con la forma del PromptInput de ai-elements: superficie redondeada con el
 * textarea autoexpandible arriba y un pie con las acciones (slot «+» a la izquierda; menú de modelo,
 * micrófono y enviar/parar a la derecha). Tokens del design system, sin shadcn.
 *
 * Dictado por voz (Web Speech API nativa): el micrófono activa la escucha; mientras escucha aparece
 * el ORBE del agente arriba a la derecha (portal a `body`, `pointer-events:none` → nunca bloquea
 * clics), y lo que dices SE VA ESCRIBIENDO EN EL INPUT en vivo (provisional incluido). Al parar o
 * enviar se vuelca lo pendiente.
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
  const [value, setValue] = useState(''); // texto consolidado (tecleado + frases ya finalizadas)
  const [interim, setInterim] = useState(''); // frase provisional en vivo del dictado
  // Lo que se muestra y se envía = consolidado + provisional (así se ve escribir mientras hablas).
  const display = interim ? appendSpoken(value, interim) : value;
  const canSend = display.trim().length > 0 && !disabled;
  const busy = status !== 'ready';

  const speech = useSpeechRecognition({
    lang: 'es-ES',
    onFinal: (text) => {
      if (!text) return;
      setValue((v) => appendSpoken(v, text));
      setInterim('');
    },
    onInterim: setInterim,
  });

  const submit = (): void => {
    const text = display.trim();
    if (!text) return;
    speech.stop();
    setInterim('');
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

  const handleMic = (): void => {
    if (speech.listening) {
      // Al parar, vuelca al input cualquier provisional aún sin finalizar (no se pierde nada).
      if (interim) setValue((v) => appendSpoken(v, interim));
      setInterim('');
      speech.stop();
    } else {
      onFocus?.();
      speech.toggle();
    }
  };

  return (
    <div className={`prompt-input${disabled ? ' is-disabled' : ''}`} data-testid="chat-composer">
      {queueLength > 0 && (
        <p className="prompt-input__queue" role="status">
          {queueLength === 1 ? '1 mensaje en cola' : `${queueLength} mensajes en cola`}
        </p>
      )}
      {speech.error && (
        <p className="prompt-input__voice-error" role="alert" data-testid="voice-error">
          {friendlyVoiceError(speech.error)}
        </p>
      )}
      <textarea
        className="prompt-input__textarea"
        value={display}
        onChange={(e) => {
          // Tecleo manual: consolida y descarta cualquier provisional en curso.
          setValue(e.target.value);
          if (interim) setInterim('');
        }}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        placeholder={placeholder}
        rows={Math.min(8, Math.max(1, display.split('\n').length))}
        disabled={disabled}
        data-testid="chat-input"
      />
      <div className="prompt-input__footer">
        <div className="prompt-input__tools">{leading}</div>
        <div className="prompt-input__actions">
          {trailing}
          {speech.supported && (
            <button
              type="button"
              className={`prompt-input__mic${speech.listening ? ' is-listening' : ''}`}
              onClick={handleMic}
              disabled={disabled}
              aria-label={speech.listening ? 'Detener dictado' : 'Hablar por voz'}
              aria-pressed={speech.listening}
              title={speech.listening ? 'Detener dictado' : 'Hablar por voz'}
              data-testid="chat-mic"
            >
              <Mic size={17} aria-hidden="true" />
            </button>
          )}
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

      {/* Indicador de escucha: el orbe del agente arriba a la derecha (portal al body para escapar
          del dock transformado). pointer-events:none → jamás intercepta clics. El texto dictado se
          ve en el propio input, así que aquí solo va la señal de estado. */}
      {speech.listening &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="voice-listening"
            role="status"
            aria-live="polite"
            data-testid="voice-listening"
          >
            <span className="agent-orb agent-orb--md agent-orb--listening" aria-hidden="true" />
            <div className="voice-listening__text">
              <span className="voice-listening__label">Escuchando…</span>
              <span className="voice-listening__interim">
                {interim ? interim : 'Habla y lo iré escribiendo en el chat'}
              </span>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

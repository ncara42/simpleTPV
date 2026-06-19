import { ArrowUp, Square } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';

interface ChatInputProps {
  streaming: boolean;
  queueLength: number;
  disabled: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function ChatInput({ streaming, queueLength, disabled, onSend, onStop }: ChatInputProps) {
  const [value, setValue] = useState('');

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envía; Shift+Enter inserta salto de línea.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="chat-input">
      {queueLength > 0 && (
        <p className="chat-input__queue" role="status">
          {queueLength === 1 ? '1 mensaje en cola' : `${queueLength} mensajes en cola`}
        </p>
      )}
      <div className="chat-input__row">
        <textarea
          className="chat-input__area"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje…"
          rows={Math.min(6, Math.max(1, value.split('\n').length))}
          disabled={disabled}
        />
        {streaming ? (
          <button
            type="button"
            className="chat-send-btn chat-send-btn--stop"
            onClick={onStop}
            aria-label="Detener"
            title="Detener"
          >
            <Square size={15} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className="chat-send-btn"
            onClick={submit}
            disabled={disabled || !value.trim()}
            aria-label="Enviar"
            title="Enviar"
          >
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

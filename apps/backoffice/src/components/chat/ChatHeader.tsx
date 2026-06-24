import { History, Plus, X } from 'lucide-react';

interface ChatHeaderProps {
  showHistory: boolean;
  onToggleHistory: () => void;
  onNewConversation: () => void;
  /** Cierra el popover. Ausente cuando el panel es permanente (modo hero del Dashboard). */
  onClose?: (() => void) | undefined;
}

// Cabecera del popover de conversación. El selector de modelo + esfuerzo se movió al pie del
// composer (estilo PromptInput de Claude), así que aquí solo quedan las acciones de la sesión:
// historial, nueva conversación y cerrar.
export function ChatHeader({
  showHistory,
  onToggleHistory,
  onNewConversation,
  onClose,
}: ChatHeaderProps) {
  return (
    <header className="chat-header">
      <span className="chat-header__title">Asistente</span>

      <div className="chat-header__actions">
        <button
          type="button"
          className={`chat-icon-btn${showHistory ? ' is-active' : ''}`}
          onClick={onToggleHistory}
          aria-pressed={showHistory}
          aria-label="Historial"
          title="Historial"
        >
          <History size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="chat-icon-btn"
          onClick={onNewConversation}
          aria-label="Nueva conversación"
          title="Nueva conversación"
        >
          <Plus size={16} aria-hidden="true" />
        </button>
        {onClose && (
          <button
            type="button"
            className="chat-icon-btn"
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
}

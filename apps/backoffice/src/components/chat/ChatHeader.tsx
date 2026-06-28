import { History, Plus, X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ChatHeaderProps {
  showHistory: boolean;
  onToggleHistory: () => void;
  onNewConversation: () => void;
  /** Cierra la ventana. Ausente cuando el panel es permanente. */
  onClose?: (() => void) | undefined;
  /** Indicador de uso de contexto (tokens/coste): vive ARRIBA, junto a las acciones de la cabecera. */
  contextSlot?: ReactNode;
}

// Cabecera del asistente. El selector de modelo + esfuerzo se movió al pie del composer (estilo
// PromptInput de Claude); aquí quedan el título, el indicador de contexto (arriba) y las acciones de
// sesión: historial, nueva conversación y cerrar.
export function ChatHeader({
  showHistory,
  onToggleHistory,
  onNewConversation,
  onClose,
  contextSlot,
}: ChatHeaderProps) {
  return (
    <header className="chat-header">
      <span className="chat-header__title">Asistente</span>

      <div className="chat-header__actions">
        {contextSlot}
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

import { Trash2 } from 'lucide-react';

import type { ChatConversation } from '../../lib/chat.js';

interface ChatConversationListProps {
  conversations: ChatConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function fallbackTitle(conversation: ChatConversation): string {
  return new Date(conversation.updatedAt).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChatConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
}: ChatConversationListProps) {
  if (conversations.length === 0) {
    return <p className="chat-convos__empty">Sin conversaciones todavía.</p>;
  }

  return (
    <ul className="chat-convos">
      {conversations.map((conversation) => (
        <li
          key={conversation.id}
          className={`chat-convo${conversation.id === activeId ? ' is-active' : ''}`}
        >
          <button
            type="button"
            className="chat-convo__open"
            onClick={() => onSelect(conversation.id)}
          >
            {conversation.title?.trim() || fallbackTitle(conversation)}
          </button>
          <button
            type="button"
            className="chat-convo__delete"
            onClick={() => onDelete(conversation.id)}
            aria-label="Eliminar conversación"
            title="Eliminar conversación"
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

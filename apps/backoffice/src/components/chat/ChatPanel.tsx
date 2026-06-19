import './chat.css';

import { History, MessageSquarePlus, PanelLeftClose, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { CanvasOp } from '../../lib/chat.js';
import { ChatConversationList } from './ChatConversationList.js';
import { ChatHeader } from './ChatHeader.js';
import { ChatInput } from './ChatInput.js';
import { ChatMessages } from './ChatMessages.js';
import { useChat } from './useChat.js';

const LS_COLLAPSED = 'dashboard.chatCollapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(LS_COLLAPSED) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(LS_COLLAPSED, value ? '1' : '0');
  } catch {
    /* almacenamiento no disponible */
  }
}

function formatEur(value: string): string {
  const amount = Number(value);
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export interface ChatPanelProps {
  /** Solo activo (carga y visible) en la pestaña Dashboard. */
  enabled?: boolean;
  onCanvasOp?: (toolCallId: string, op: CanvasOp) => void;
  onUndoCanvasOps?: (ops: CanvasOp[]) => void;
}

export function ChatPanel({ enabled = true, onCanvasOp, onUndoCanvasOps }: ChatPanelProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [showHistory, setShowHistory] = useState(false);

  const chat = useChat({ enabled: enabled && !collapsed, onCanvasOp, onUndoCanvasOps });

  useEffect(() => {
    writeCollapsed(collapsed);
  }, [collapsed]);

  if (collapsed) {
    return (
      <aside className="chat-rail" aria-label="Asistente">
        <button
          type="button"
          className="chat-icon-btn"
          onClick={() => setCollapsed(false)}
          aria-label="Abrir asistente"
          title="Abrir asistente"
        >
          <Sparkles size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="chat-icon-btn"
          onClick={() => {
            setCollapsed(false);
            chat.newConversation();
          }}
          aria-label="Nueva conversación"
          title="Nueva conversación"
        >
          <MessageSquarePlus size={18} aria-hidden="true" />
        </button>
      </aside>
    );
  }

  const handleNewConversation = () => {
    chat.newConversation();
    setShowHistory(false);
  };

  const handleSelect = (id: string) => {
    chat.selectConversation(id);
    setShowHistory(false);
  };

  return (
    <aside className="chat-panel" aria-label="Asistente">
      <ChatHeader
        models={chat.models}
        model={chat.model}
        onModelChange={chat.setModel}
        effort={chat.effort}
        onEffortChange={chat.setEffort}
        onNewConversation={handleNewConversation}
        onCollapse={() => setCollapsed(true)}
      />

      <div className="chat-panel__subbar">
        <button
          type="button"
          className={`chat-subbar-btn${showHistory ? ' is-active' : ''}`}
          onClick={() => setShowHistory((v) => !v)}
        >
          <History size={13} aria-hidden="true" /> Historial
        </button>
        {showHistory && (
          <button
            type="button"
            className="chat-icon-btn chat-icon-btn--text"
            onClick={() => setShowHistory(false)}
            aria-label="Cerrar historial"
          >
            <PanelLeftClose size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {chat.error && (
        <div className="chat-error" role="alert">
          <span>{chat.error}</span>
          <button type="button" onClick={chat.dismissError} aria-label="Descartar error">
            ×
          </button>
        </div>
      )}

      {showHistory ? (
        <div className="chat-panel__history">
          <ChatConversationList
            conversations={chat.conversations}
            activeId={chat.activeId}
            onSelect={handleSelect}
            onDelete={chat.removeConversation}
          />
        </div>
      ) : (
        <ChatMessages
          messages={chat.messages}
          loading={chat.loadingMessages}
          streaming={chat.streaming}
          streamingText={chat.streamingText}
          streamingToolCalls={chat.streamingToolCalls}
          onRegenerate={chat.regenerate}
          onEditAndResend={chat.editAndResend}
        />
      )}

      <ChatInput
        streaming={chat.streaming}
        queueLength={chat.queueLength}
        disabled={!chat.model}
        onSend={chat.send}
        onStop={chat.stop}
      />

      {chat.usage && (
        <footer className="chat-footer">
          Esta conversación: {formatEur(chat.usage.total.costEur)}
        </footer>
      )}
    </aside>
  );
}

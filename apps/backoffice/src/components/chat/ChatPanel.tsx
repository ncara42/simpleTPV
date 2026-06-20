import './chat.css';

import { History, MessageSquarePlus, PanelLeftClose, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { CanvasOp } from '../../lib/chat.js';
import { ChatConversationList } from './ChatConversationList.js';
import { ChatHeader } from './ChatHeader.js';
import { ChatInput } from './ChatInput.js';
import { ChatMessages } from './ChatMessages.js';
import { type CanvasApplyResult, useChat } from './useChat.js';

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
  /** Aplica un canvas_op en el lienzo y devuelve el resultado para el feedback loop. */
  onCanvasOp?: (op: CanvasOp) => CanvasApplyResult | void;
  onUndoCanvasOps?: (ops: CanvasOp[]) => void;
  /** Snapshot fresco del lienzo para el system prompt del agente (F5). */
  getCanvasState?: () => unknown;
}

export function ChatPanel({
  enabled = true,
  onCanvasOp,
  onUndoCanvasOps,
  getCanvasState,
}: ChatPanelProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [showHistory, setShowHistory] = useState(false);

  const chat = useChat({
    enabled: enabled && !collapsed,
    onCanvasOp,
    onUndoCanvasOps,
    getCanvasState,
  });

  useEffect(() => {
    writeCollapsed(collapsed);
  }, [collapsed]);

  if (collapsed) {
    return (
      <aside className="chat-rail" aria-label="Asistente" data-testid="chat-rail">
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
    <aside className="chat-panel" aria-label="Asistente" data-testid="chat-panel">
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

      {chat.modelsLoaded && chat.models.length === 0 ? (
        <div className="chat-notice" role="status" data-testid="chat-no-ai">
          <p className="chat-notice__title">El asistente de IA no está configurado</p>
          <p className="chat-notice__body">
            Define <code>OPENAI_API_KEY</code> o <code>ANTHROPIC_API_KEY</code> en el backend para
            activarlo.
          </p>
        </div>
      ) : (
        <ChatInput
          streaming={chat.streaming}
          queueLength={chat.queueLength}
          disabled={!chat.model}
          onSend={chat.send}
          onStop={chat.stop}
        />
      )}

      {chat.usage && (
        <footer className="chat-footer">
          Esta conversación: {formatEur(chat.usage.total.costEur)}
        </footer>
      )}
    </aside>
  );
}

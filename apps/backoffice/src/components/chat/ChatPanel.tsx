import './chat.css';

import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { CanvasOp } from '../../lib/chat.js';
import { ChatConversationList } from './ChatConversationList.js';
import { ChatHeader } from './ChatHeader.js';
import { ChatInput } from './ChatInput.js';
import { ChatMessages } from './ChatMessages.js';
import { type CanvasApplyResult, useChat } from './useChat.js';

// Clave histórica: '1' = cerrado (antes «colapsado»). Se reutiliza para no perder la
// preferencia de usuarios actuales; `open` invierte la lectura/escritura.
const LS_COLLAPSED = 'dashboard.chatCollapsed';

function readOpen(): boolean {
  try {
    return localStorage.getItem(LS_COLLAPSED) !== '1';
  } catch {
    return true;
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(LS_COLLAPSED, open ? '0' : '1');
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
  const [open, setOpen] = useState(readOpen);
  const [showHistory, setShowHistory] = useState(false);

  const chat = useChat({
    enabled: enabled && open,
    onCanvasOp,
    onUndoCanvasOps,
    getCanvasState,
  });

  useEffect(() => {
    writeOpen(open);
  }, [open]);

  // Escape cierra el panel flotante (vuelve al FAB).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        className="chat-fab"
        onClick={() => setOpen(true)}
        aria-label="Abrir asistente"
        aria-expanded={false}
        title="Asistente"
        data-testid="chat-fab"
      >
        <Sparkles size={22} aria-hidden="true" />
      </button>
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
    <aside className="chat-panel" role="dialog" aria-label="Asistente" data-testid="chat-panel">
      <ChatHeader
        models={chat.models}
        model={chat.model}
        onModelChange={chat.setModel}
        effort={chat.effort}
        onEffortChange={chat.setEffort}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory((v) => !v)}
        onNewConversation={handleNewConversation}
        onClose={() => setOpen(false)}
      />

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

import './chat.css';
import './assistant-drawer.css';

import { useEffect, useRef, useState } from 'react';

import { useAssistantStore } from '../../lib/assistant-store.js';
import type { CanvasOp } from '../../lib/chat.js';
import { ChatConversationList } from './ChatConversationList.js';
import { ChatHeader } from './ChatHeader.js';
import { ChatMessages } from './ChatMessages.js';
import { Context } from './Context.js';
import { PromptComposer } from './PromptComposer.js';
import { type CanvasApplyResult, useChat } from './useChat.js';
import type { ViewContext } from './view-context.js';

export interface ChatDockProps {
  /** Aplica un canvas_op en el lienzo y devuelve el resultado para el feedback loop. */
  onCanvasOp?: (op: CanvasOp) => CanvasApplyResult | void;
  onUndoCanvasOps?: (ops: CanvasOp[]) => void;
  /** Snapshot fresco del lienzo para el system prompt del agente. */
  getCanvasState?: () => unknown;
  /** Ejecuta una acción de pantalla del agente fuera del dashboard (scroll/resaltar/filtrar). */
  onViewAction?: (action: string, args: unknown) => void;
  /** Vista activa del backoffice: define saludo, sugerencias y el contexto enviado al backend. */
  view: ViewContext;
}

/** Selector del lanzador en la TopBar; se le devuelve el foco al cerrar el drawer (a11y). */
const LAUNCHER_SELECTOR = '[data-testid="assistant-launcher"]';

/**
 * Asistente como DRAWER lateral derecho. Una única superficie flotante (`position: fixed`,
 * overlay) que comparten el Dashboard y el resto de views: el lanzador ✦ de la isla la togglea
 * (useAssistantStore). Al abrirse NO reflowa el lienzo —se superpone sobre el borde derecho—, así
 * que NUNCA reescala widgets ni tablas. El panel está siempre montado y desliza por `transform`;
 * cerrado queda fuera de pantalla (`inert`), abierto lleva el foco al composer y un backdrop
 * transparente cierra al clicar fuera.
 */
export function ChatDock({
  onCanvasOp,
  onUndoCanvasOps,
  getCanvasState,
  onViewAction,
  view,
}: ChatDockProps) {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const [showHistory, setShowHistory] = useState(false);

  const panelRef = useRef<HTMLElement>(null);
  const prevOpen = useRef(open);

  const chat = useChat({
    enabled: true,
    onCanvasOp,
    onUndoCanvasOps,
    getCanvasState,
    onViewAction,
    view: { id: view.id, label: view.label },
  });

  // Escape cierra el drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  // Gestión de foco SOLO en transiciones (no en el render inicial, para no robar el foco al cargar):
  // al abrir → foco al composer; al cerrar → foco de vuelta al lanzador de la TopBar.
  useEffect(() => {
    if (open && !prevOpen.current) {
      panelRef.current?.querySelector<HTMLTextAreaElement>('.prompt-input__textarea')?.focus();
    } else if (!open && prevOpen.current) {
      document.querySelector<HTMLButtonElement>(LAUNCHER_SELECTOR)?.focus();
    }
    prevOpen.current = open;
  }, [open]);

  const handleSend = (text: string): void => {
    chat.send(text);
    setOpen(true);
  };

  const handleNewConversation = (): void => {
    chat.newConversation();
    setShowHistory(false);
    setOpen(true);
  };

  const handleSelect = (id: string): void => {
    chat.selectConversation(id);
    setShowHistory(false);
  };

  const noAi = chat.modelsLoaded && chat.models.length === 0;

  return (
    <div
      className={`chat-dock chat-dock--drawer${open ? ' is-open' : ''}`}
      data-testid="chat-dock"
      aria-hidden={!open}
    >
      {/* Backdrop: con el drawer abierto, un clic fuera del panel SOLO cierra el chat y NO activa
          lo que haya debajo (el clic aterriza aquí). Transparente: no oscurece el lienzo. */}
      {open && (
        <div
          className="chat-dock__backdrop"
          onClick={() => setOpen(false)}
          data-testid="chat-backdrop"
          aria-hidden="true"
        />
      )}
      <aside
        className="chat-dock__panel"
        ref={panelRef}
        role="dialog"
        aria-label="Asistente de IA"
        // Cerrado = fuera de pantalla: `inert` lo saca del orden de tabulación y del árbol a11y.
        inert={!open}
        data-testid="chat-panel"
      >
        <ChatHeader
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
            streamingReasoning={chat.streamingReasoning}
            streamingToolCalls={chat.streamingToolCalls}
            onRegenerate={chat.regenerate}
            onEditAndResend={chat.editAndResend}
            onSuggest={handleSend}
            greeting={view.greeting}
            suggestions={view.suggestions}
          />
        )}

        {noAi && (
          <div className="chat-notice" role="status" data-testid="chat-no-ai">
            <p className="chat-notice__title">El asistente de IA no está configurado</p>
            <p className="chat-notice__body">
              Define <code>OPENAI_API_KEY</code> o <code>ANTHROPIC_API_KEY</code> en el backend para
              activarlo.
            </p>
          </div>
        )}

        {chat.usage && (
          <footer className="chat-footer">
            <span>Esta conversación</span>
            <Context
              inputTokens={chat.usage.total.inputTokens}
              outputTokens={chat.usage.total.outputTokens}
              costEur={chat.usage.total.costEur}
            />
          </footer>
        )}

        <div className="chat-dock__bar">
          <PromptComposer
            status={
              !chat.streaming
                ? 'ready'
                : chat.streamingText || chat.streamingReasoning
                  ? 'streaming'
                  : 'submitted'
            }
            disabled={noAi || !chat.model}
            queueLength={chat.queueLength}
            onSend={handleSend}
            onStop={chat.stop}
            onFocus={() => setOpen(true)}
            collapsed={false}
          />
        </div>
      </aside>
    </div>
  );
}

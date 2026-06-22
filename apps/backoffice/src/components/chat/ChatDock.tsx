import './chat.css';

import { MessageSquare } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';

import type { CanvasOp } from '../../lib/chat.js';
import type { CanvasMeta, FreeBoardHandle } from '../FreeBoard.js';
import { CanvasToolsMenu } from './CanvasToolsMenu.js';
import { ChatConversationList } from './ChatConversationList.js';
import { ChatHeader } from './ChatHeader.js';
import { ChatMessages } from './ChatMessages.js';
import { Context } from './Context.js';
import { ModelEffortMenu } from './ModelEffortMenu.js';
import { PromptComposer } from './PromptComposer.js';
import { type CanvasApplyResult, useChat } from './useChat.js';
import type { ViewContext } from './view-context.js';

export interface ChatDockProps {
  /**
   * Handle imperativo del lienzo para el menú «+» de herramientas. Opcional: el dock vive en el
   * shell y aparece en TODAS las views; solo el Dashboard tiene lienzo. Sin él se oculta el «+».
   */
  canvasRef?: RefObject<FreeBoardHandle | null>;
  /** Estado reactivo del lienzo (deshacer / dibujo). Opcional (ver `canvasRef`). */
  canvasMeta?: CanvasMeta;
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

/**
 * Dock inferior del dashboard: una única barra `[+ herramientas] [input] [enviar]` con la
 * forma del PromptInput de ai-elements, más un popover de conversación que se despliega ENCIMA
 * del input. Sustituye al antiguo panel lateral (FAB + glass) del asistente — primer paso de la
 * migración progresiva del chatbot a la barra inferior.
 */
export function ChatDock({
  canvasRef,
  canvasMeta,
  onCanvasOp,
  onUndoCanvasOps,
  getCanvasState,
  onViewAction,
  view,
}: ChatDockProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  const chat = useChat({
    enabled: true,
    onCanvasOp,
    onUndoCanvasOps,
    getCanvasState,
    onViewAction,
    view: { id: view.id, label: view.label },
  });

  // Cierra el popover de conversación al pulsar Escape o al hacer clic FUERA del dock (panel +
  // input). El dock (la barra inferior) es permanente: clicar el input no lo cierra; clicar el
  // lienzo, el sidebar o cualquier otra zona, sí.
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    const onDown = (e: PointerEvent): void => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) setPanelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [panelOpen]);

  const handleSend = (text: string): void => {
    chat.send(text);
    setPanelOpen(true);
  };

  const handleNewConversation = (): void => {
    chat.newConversation();
    setShowHistory(false);
    setPanelOpen(true);
  };

  const handleSelect = (id: string): void => {
    chat.selectConversation(id);
    setShowHistory(false);
  };

  const noAi = chat.modelsLoaded && chat.models.length === 0;

  const leading = (
    <>
      {canvasRef && canvasMeta && (
        <CanvasToolsMenu
          canvasRef={canvasRef}
          canUndo={canvasMeta.canUndo}
          drawActive={canvasMeta.drawOpen}
        />
      )}
      <button
        type="button"
        className={`chat-dock__history-toggle${panelOpen ? ' is-active' : ''}`}
        onClick={() => setPanelOpen((v) => !v)}
        aria-label={panelOpen ? 'Ocultar conversación' : 'Mostrar conversación'}
        aria-pressed={panelOpen}
        title="Conversación"
        data-testid="chat-toggle-panel"
      >
        <MessageSquare size={17} aria-hidden="true" />
      </button>
    </>
  );

  return (
    <div className="chat-dock" data-testid="chat-dock" ref={dockRef}>
      {panelOpen && (
        <aside
          className="chat-dock__panel"
          role="dialog"
          aria-label="Asistente"
          data-testid="chat-panel"
        >
          <ChatHeader
            showHistory={showHistory}
            onToggleHistory={() => setShowHistory((v) => !v)}
            onNewConversation={handleNewConversation}
            onClose={() => setPanelOpen(false)}
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
                Define <code>OPENAI_API_KEY</code> o <code>ANTHROPIC_API_KEY</code> en el backend
                para activarlo.
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
        </aside>
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
          onFocus={() => setPanelOpen(true)}
          leading={leading}
          trailing={
            !noAi && chat.models.length > 0 ? (
              <ModelEffortMenu
                models={chat.models}
                model={chat.model}
                onModelChange={chat.setModel}
                effort={chat.effort}
                onEffortChange={chat.setEffort}
              />
            ) : undefined
          }
        />
      </div>
    </div>
  );
}

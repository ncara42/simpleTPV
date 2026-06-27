import './chat.css';

import { MessageSquare } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAnimatedPresence } from '../../hooks/use-animated-presence.js';
import type { CanvasOp } from '../../lib/chat.js';
import { ChatConversationList } from './ChatConversationList.js';
import { ChatHeader } from './ChatHeader.js';
import { ChatMessages } from './ChatMessages.js';
import { Context } from './Context.js';
import { PromptComposer } from './PromptComposer.js';
import { type CanvasApplyResult, useChat } from './useChat.js';
import type { ViewContext } from './view-context.js';

/** Duración (ms) de la entrada/salida del popover de conversación; coincide con `--ui-motion-medium`. */
const PANEL_MOTION_MS = 180;

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
  /**
   * En el Dashboard («Asistente de IA») el composer es el HÉROE: el panel (conversación o
   * saludo + sugerencias) y el input se muestran grandes y centrados. Fuera del Dashboard es la
   * barra compacta anclada abajo. El morph entre ambos estados lo anima `.chat-dock` por transform.
   */
  hero?: boolean;
}

/**
 * Dock inferior del dashboard: una única barra `[+ herramientas] [input] [enviar]` con la
 * forma del PromptInput de ai-elements, más un popover de conversación que se despliega ENCIMA
 * del input. Sustituye al antiguo panel lateral (FAB + glass) del asistente — primer paso de la
 * migración progresiva del chatbot a la barra inferior.
 */
export function ChatDock({
  onCanvasOp,
  onUndoCanvasOps,
  getCanvasState,
  onViewAction,
  view,
  hero = false,
}: ChatDockProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Fuera del dashboard, y mientras el popover esté cerrado, el dock se reduce a una píldora
  // redonda solo-input; al enfocarlo (panelOpen → true) o al volver al dashboard recupera su
  // tamaño y forma originales y reaparecen los botones (todo animado por CSS).
  const isDashboard = view.id === 'dashboard';
  const collapsed = !isDashboard && !panelOpen;

  // El popover se mantiene montado mientras dura su animación de salida → cierre simétrico.
  const { isMounted: panelMounted, isClosing: panelClosing } = useAnimatedPresence(
    panelOpen,
    PANEL_MOTION_MS,
  );

  const chat = useChat({
    enabled: true,
    onCanvasOp,
    onUndoCanvasOps,
    getCanvasState,
    onViewAction,
    view: { id: view.id, label: view.label },
  });

  // Cierra el popover de conversación con Escape. El clic FUERA lo gestiona el backdrop (ver render):
  // captura el clic para SOLO cerrar el chat, sin activar lo que haya debajo (botones, sidebar, lienzo).
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
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
    <div
      className={`chat-dock${hero ? ' chat-dock--hero' : ''}${collapsed ? ' is-collapsed' : ''}${
        panelOpen ? ' is-panel-open' : ''
      }`}
      data-testid="chat-dock"
      data-hero={hero ? '' : undefined}
    >
      {/* Backdrop: con el chat abierto, un clic fuera del panel/composer SOLO cierra el chat y NO
          activa lo que haya debajo (el clic aterriza aquí, no en el botón). */}
      {panelOpen && (
        <div
          className="chat-dock__backdrop"
          onClick={() => setPanelOpen(false)}
          data-testid="chat-backdrop"
          aria-hidden="true"
        />
      )}
      {(hero || panelMounted) && (
        <aside
          className={`chat-dock__panel${panelClosing ? ' is-closing' : ''}`}
          role="dialog"
          aria-label="Asistente"
          data-testid="chat-panel"
        >
          <ChatHeader
            showHistory={showHistory}
            onToggleHistory={() => setShowHistory((v) => !v)}
            onNewConversation={handleNewConversation}
            // En hero el panel no se cierra (es permanente): se oculta la X.
            onClose={hero ? undefined : () => setPanelOpen(false)}
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
          collapsed={collapsed}
          // En hero el panel (con su cabecera: historial/nueva) es permanente, así que el toggle
          // del input sobra. En barra compacta sí lo mostramos para abrir/cerrar la conversación.
          leading={hero ? undefined : leading}
        />
      </div>
    </div>
  );
}

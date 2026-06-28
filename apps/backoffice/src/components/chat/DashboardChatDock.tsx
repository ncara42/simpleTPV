import './chat.css';
import './dashboard-dock.css';

import { MessageSquare } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAnimatedPresence } from '../../hooks/use-animated-presence.js';
import { useAssistantStore } from '../../lib/assistant-store.js';
import { ChatConversationList } from './ChatConversationList.js';
import type { ChatDockProps } from './ChatDock.js';
import { ChatHeader } from './ChatHeader.js';
import { ChatMessages } from './ChatMessages.js';
import { Context } from './Context.js';
import { ModelEffortMenu } from './ModelEffortMenu.js';
import { PromptComposer } from './PromptComposer.js';
import { useChat } from './useChat.js';

/** Duración (ms) de la entrada/salida del popover de conversación; coincide con `--ui-motion-medium`. */
const PANEL_MOTION_MS = 180;

/**
 * Asistente del DASHBOARD: barra inferior centrada (`[💬] [input] [enviar]`) anclada abajo-centro
 * SIEMPRE visible, con un popover de conversación que se despliega ENCIMA del input. El Dashboard ES
 * el «Asistente de IA», por eso aquí el chat vive abajo y en primer plano —no como la ventana
 * flotante del resto de views (ver {@link ChatDock})—. El estado abierto/cerrado del popover se
 * comparte con el store (`useAssistantStore`): el lanzador 🤖 de la isla lo abre/cierra, igual que
 * enfocar el composer o el botón 💬. La barra permanece visible esté el popover abierto o no.
 */
export function DashboardChatDock({
  onCanvasOp,
  onUndoCanvasOps,
  getCanvasState,
  onViewAction,
  view,
}: ChatDockProps) {
  // El popover se gobierna desde el store: así el robot 🤖 de la TopBar lo abre/cierra (la barra
  // inferior, en cambio, siempre se ve). Sin estado local duplicado.
  const panelOpen = useAssistantStore((s) => s.open);
  const setPanelOpen = useAssistantStore((s) => s.setOpen);
  const [showHistory, setShowHistory] = useState(false);

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

  // Escape cierra el popover de conversación. El clic FUERA lo gestiona el backdrop (ver render):
  // captura el clic para SOLO cerrar el chat, sin activar lo que haya debajo (botones, sidebar,
  // lienzo).
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [panelOpen, setPanelOpen]);

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

  // Botón de la barra que abre/cierra la conversación (junto al input), en paralelo al robot 🤖.
  const leading = (
    <button
      type="button"
      className={`chat-dock__history-toggle${panelOpen ? ' is-active' : ''}`}
      onClick={() => setPanelOpen(!panelOpen)}
      aria-label={panelOpen ? 'Ocultar conversación' : 'Mostrar conversación'}
      aria-pressed={panelOpen}
      title="Conversación"
      data-testid="chat-toggle-panel"
    >
      <MessageSquare size={17} aria-hidden="true" />
    </button>
  );

  return (
    <div
      className={`chat-dock chat-dock--bottombar${panelOpen ? ' is-panel-open' : ''}`}
      data-testid="chat-dock"
    >
      {/* Backdrop: con el popover abierto, un clic fuera SOLO cierra el chat y NO activa lo que haya
          debajo (el clic aterriza aquí). Transparente: no oscurece el lienzo. */}
      {panelOpen && (
        <div
          className="chat-dock__backdrop"
          onClick={() => setPanelOpen(false)}
          data-testid="chat-backdrop"
          aria-hidden="true"
        />
      )}

      {panelMounted && (
        <aside
          className={`chat-dock__panel${panelClosing ? ' is-closing' : ''}`}
          role="dialog"
          aria-label="Asistente de IA"
          data-testid="chat-panel"
        >
          <ChatHeader
            showHistory={showHistory}
            onToggleHistory={() => setShowHistory((v) => !v)}
            onNewConversation={handleNewConversation}
            onClose={() => setPanelOpen(false)}
            contextSlot={
              chat.usage ? (
                <Context
                  inputTokens={chat.usage.total.inputTokens}
                  outputTokens={chat.usage.total.outputTokens}
                  costEur={chat.usage.total.costEur}
                />
              ) : undefined
            }
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
          collapsed={false}
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

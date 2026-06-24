import { ArrowDown, Check, Copy, Pencil, RefreshCw } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import type { ChatMessage, ToolResult } from '../../lib/chat.js';
import { ChainOfThought, type ThoughtItem } from './ChainOfThought.js';
import { ChatMarkdown } from './ChatMarkdown.js';
import { Shimmer } from './Shimmer.js';
import { Suggestion, Suggestions } from './Suggestions.js';
import { toolLabel } from './toolLabels.js';

interface ChatMessagesProps {
  messages: ChatMessage[];
  loading: boolean;
  streaming: boolean;
  streamingText: string;
  streamingReasoning: string;
  streamingToolCalls: { id: string; name: string; args: unknown }[];
  onRegenerate: (assistantMessageId: string) => void;
  onEditAndResend: (userMessageId: string, newText: string) => void;
  /** Envía un prompt sugerido desde el estado vacío. */
  onSuggest?: (text: string) => void;
  /** Saludo del estado vacío, dependiente de la vista activa. */
  greeting: string;
  /** Prompts de arranque sugeridos, dependientes de la vista activa. */
  suggestions: string[];
}

function messageText(message: ChatMessage): string {
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// ── Clasificación de tools (espejo de CANVAS_OP_NAMES / VIEW_ACTION_NAMES del backend) ──
// CONSULTAS de datos (nodo índigo) vs ACCIONES sobre el lienzo/pantalla (nodo de marca).

const CANVAS_OP_NAMES: ReadonlySet<string> = new Set([
  'add_widget',
  'add_shape',
  'add_text',
  'add_note',
  'add_insight',
  'remove_element',
  'arrange',
  'clear_canvas',
]);
const VIEW_ACTION_NAMES: ReadonlySet<string> = new Set(['highlight_on_view', 'filter_view']);
const isActionTool = (name: string): boolean =>
  CANVAS_OP_NAMES.has(name) || VIEW_ACTION_NAMES.has(name);

// ¿La canvas op fue rechazada? El resultado vuelve como tool_result {accepted, reason}.
function canvasRejected(result: ToolResult | undefined): boolean {
  if (!result || result.content == null || typeof result.content !== 'object') return false;
  return (result.content as { accepted?: boolean }).accepted === false;
}

// ── Agrupación por turno ──────────────────────────────────────────────────────────
// Un turno del agente puede persistirse como VARIOS mensajes de asistente (razonar → tools →
// razonar → tools → responder). Los reunimos para pintar UNA sola cadena de pensamiento por
// respuesta en vez de un bloque «Razonamiento» + «Proceso» por ronda.

interface Turn {
  user: ChatMessage | null;
  assistants: ChatMessage[];
}

function groupTurns(messages: ChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;
  for (const msg of messages) {
    if (msg.role === 'user') {
      current = { user: msg, assistants: [] };
      turns.push(current);
    } else if (msg.role === 'assistant') {
      if (!current) {
        current = { user: null, assistants: [] };
        turns.push(current);
      }
      current.assistants.push(msg);
    }
    // Los mensajes 'tool' se omiten: sus resultados ya están indexados en resultsByCall.
  }
  return turns;
}

/**
 * Construye la cadena de pensamiento de un turno y separa la CONCLUSIÓN (la última narración del
 * asistente) para mostrarla fuera de la cadena. Todo lo demás —razonamiento, narración intermedia
 * y cada paso de tool, en orden— queda dentro de la sección desplegable.
 */
function buildTurnItems(
  assistants: ChatMessage[],
  resultsByCall: Map<string, ToolResult>,
): { items: ThoughtItem[]; finalText: string } {
  const items: ThoughtItem[] = [];
  for (const msg of assistants) {
    // El `thinking` crudo del modelo NO se muestra: filtra reglas/variables/código del
    // system prompt. La cadena solo enseña pasos de tools (etiquetas de negocio) y la
    // narración del chat (sujeta a la regla de "no nombres internos").
    for (const call of msg.toolCalls ?? []) {
      const action = isActionTool(call.name);
      const rejected = action && call.id ? canvasRejected(resultsByCall.get(call.id)) : false;
      items.push({
        kind: 'tool',
        label: toolLabel(call.name),
        variant: action ? 'action' : 'query',
        status: rejected ? 'rejected' : 'done',
      });
    }
    const text = messageText(msg);
    if (text) items.push({ kind: 'narration', text });
  }

  // La conclusión es la ÚLTIMA narración: se extrae de la cadena y se muestra como respuesta.
  let finalText = '';
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item && item.kind === 'narration') {
      finalText = item.text;
      items.splice(i, 1);
      break;
    }
  }
  return { items, finalText };
}

// ── Burbuja de usuario (con edición) ─────────────────────────────────────────────

interface UserBubbleProps {
  message: ChatMessage;
  disabled: boolean;
  onEditAndResend: (userMessageId: string, newText: string) => void;
}

function UserBubble({ message, disabled, onEditAndResend }: UserBubbleProps) {
  const original = messageText(message);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(original);
  const isOptimistic = message.id.startsWith('optimistic-');

  return (
    <div className="chat-msg chat-msg--user">
      {editing ? (
        <div className="chat-msg__edit">
          <textarea
            className="chat-msg__edit-area"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(8, Math.max(2, draft.split('\n').length))}
            autoFocus
          />
          <div className="chat-msg__edit-actions">
            <button
              type="button"
              className="chat-icon-btn chat-icon-btn--text"
              onClick={() => {
                setDraft(original);
                setEditing(false);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="chat-icon-btn chat-icon-btn--primary"
              disabled={!draft.trim() || draft.trim() === original}
              onClick={() => {
                setEditing(false);
                onEditAndResend(message.id, draft);
              }}
            >
              Reenviar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="chat-bubble chat-bubble--user">{original}</div>
          {!isOptimistic && (
            <div className="chat-msg__toolbar">
              <button
                type="button"
                className="chat-action"
                disabled={disabled}
                aria-label="Editar y reenviar"
                title="Editar y reenviar"
                onClick={() => {
                  setDraft(original);
                  setEditing(true);
                }}
              >
                <Pencil size={14} aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Turno del asistente (cadena de pensamiento única + conclusión + acciones) ──────

interface AssistantTurnProps {
  assistants: ChatMessage[];
  resultsByCall: Map<string, ToolResult>;
  disabled: boolean;
  onRegenerate: (assistantMessageId: string) => void;
}

function AssistantTurn({ assistants, resultsByCall, disabled, onRegenerate }: AssistantTurnProps) {
  const { items, finalText } = useMemo(
    () => buildTurnItems(assistants, resultsByCall),
    [assistants, resultsByCall],
  );
  // Regenerar busca el mensaje de usuario anterior, así que cualquier id del turno vale.
  const lastId = assistants[assistants.length - 1]?.id ?? '';
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    navigator.clipboard?.writeText(finalText).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => {
        /* clipboard no disponible */
      },
    );
  };

  return (
    <div className="chat-msg chat-msg--assistant">
      <ChainOfThought items={items} isStreaming={false} />
      {finalText && (
        <div className="chat-response chat-markdown">
          <ChatMarkdown>{finalText}</ChatMarkdown>
        </div>
      )}
      {finalText && (
        <div className="chat-actions">
          <button
            type="button"
            className="chat-action"
            onClick={copy}
            aria-label={copied ? 'Copiado' : 'Copiar'}
            title={copied ? 'Copiado' : 'Copiar'}
          >
            {copied ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Copy size={14} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="chat-action"
            disabled={disabled}
            onClick={() => onRegenerate(lastId)}
            aria-label="Regenerar"
            title="Regenerar"
          >
            <RefreshCw size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Lista completa ────────────────────────────────────────────────────────────────

export function ChatMessages({
  messages,
  loading,
  streaming,
  streamingText,
  streamingReasoning,
  streamingToolCalls,
  onRegenerate,
  onEditAndResend,
  onSuggest,
  greeting,
  suggestions,
}: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  // Índice global toolCallId → resultado (los results llegan en mensajes 'tool').
  const resultsByCall = useMemo(() => {
    const map = new Map<string, ToolResult>();
    for (const msg of messages) {
      for (const res of msg.toolResults ?? []) {
        map.set(res.toolCallId, res);
      }
    }
    return map;
  }, [messages]);

  const turns = useMemo(() => groupTurns(messages), [messages]);

  // Cadena de pensamiento del turno en curso: razonamiento + tools en marcha (la conclusión
  // se va escribiendo aparte en streamingText).
  const streamingItems = useMemo<ThoughtItem[]>(() => {
    // Mientras el modelo solo "piensa" (sin tools ni texto), no se muestra nada de ese
    // razonamiento crudo: el placeholder «Pensando» cubre esa fase. La cadena aparece con
    // los pasos de tools en marcha.
    const items: ThoughtItem[] = [];
    for (const call of streamingToolCalls) {
      const action = isActionTool(call.name);
      items.push({
        kind: 'tool',
        label: toolLabel(call.name),
        variant: action ? 'action' : 'query',
        status: 'running',
      });
    }
    return items;
  }, [streamingToolCalls]);

  const checkBottom = (): void => {
    const el = scrollRef.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 32);
  };

  const scrollToBottom = (): void => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  // Stick-to-bottom: solo auto-scrollea si el usuario ya estaba al final (no le interrumpe
  // mientras lee hacia arriba). El botón flotante lo lleva al final cuando quiera.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, streamingReasoning, streaming, atBottom]);

  const isEmpty = !loading && !streaming && messages.length === 0;

  return (
    <div className="chat-conversation">
      <div className="chat-messages" ref={scrollRef} onScroll={checkBottom}>
        {loading && (
          <Shimmer as="p" className="chat-messages__hint">
            Cargando conversación…
          </Shimmer>
        )}

        {isEmpty && (
          <div className="chat-messages__empty">
            <p className="chat-messages__empty-title">{greeting}</p>
            {onSuggest && (
              <Suggestions>
                {suggestions.map((s) => (
                  <Suggestion key={s} suggestion={s} onClick={onSuggest} />
                ))}
              </Suggestions>
            )}
          </div>
        )}

        {turns.map((turn, ti) => (
          <Fragment key={turn.user?.id ?? turn.assistants[0]?.id ?? ti}>
            {turn.user && (
              <UserBubble
                message={turn.user}
                disabled={streaming}
                onEditAndResend={onEditAndResend}
              />
            )}
            {turn.assistants.length > 0 && (
              <AssistantTurn
                assistants={turn.assistants}
                resultsByCall={resultsByCall}
                disabled={streaming}
                onRegenerate={onRegenerate}
              />
            )}
          </Fragment>
        ))}

        {streaming && (
          <div className="chat-msg chat-msg--assistant">
            <ChainOfThought items={streamingItems} isStreaming={true} />
            {streamingText ? (
              <div className="chat-response chat-markdown">
                <ChatMarkdown>{streamingText}</ChatMarkdown>
                <span className="chat-cursor" aria-hidden="true" />
              </div>
            ) : (
              streamingItems.length === 0 && (
                <div className="chat-thinking">
                  <span className="agent-orb agent-orb--sm is-active" aria-hidden="true" />
                  <Shimmer className="chat-messages__hint">Pensando</Shimmer>
                </div>
              )
            )}
          </div>
        )}
      </div>
      {!atBottom && (
        <button
          type="button"
          className="chat-scroll-btn"
          onClick={scrollToBottom}
          aria-label="Ir al final"
          title="Ir al final"
        >
          <ArrowDown size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

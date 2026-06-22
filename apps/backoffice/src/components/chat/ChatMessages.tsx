import { ArrowDown, Check, Copy, Pencil, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { ChatMessage, ToolResult } from '../../lib/chat.js';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from '../ai-elements/chain-of-thought.js';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '../ai-elements/message.js';
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from '../ai-elements/plan.js';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '../ai-elements/reasoning.js';
import { Task, TaskContent, TaskItem, TaskTrigger } from '../ai-elements/task.js';
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

// Razonamiento persistido (bloques de contenido `thinking`), si el modelo lo produjo.
function messageThinking(message: ChatMessage): string {
  return message.content
    .filter((b) => b.type === 'thinking')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// ── Actividad del agente (consultas + acciones) ───────────────────────────────────
// Sustituye el ToolChip casero por componentes de AI Elements: las CONSULTAS de datos se muestran
// como cadena de razonamiento (ChainOfThought) y las ACCIONES sobre el lienzo o la pantalla como un
// plan con tareas (Plan › Task). La partición es por nombre de tool (espejo de
// CANVAS_OP_NAMES/VIEW_ACTION_NAMES del backend, crates/http/src/chat.rs).

interface ActivityCall {
  id?: string;
  name: string;
  args: unknown;
}

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

function isActionTool(name: string): boolean {
  return CANVAS_OP_NAMES.has(name) || VIEW_ACTION_NAMES.has(name);
}

// Lee el primer campo string presente (tolerante a snake_case del LLM y camelCase del op).
function argString(args: unknown, ...keys: string[]): string | undefined {
  if (args == null || typeof args !== 'object') return undefined;
  const obj = args as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

// Título de un panel a medida dentro de generic_spec/genericSpec (si lo hay).
function genericTitle(args: unknown): string | undefined {
  if (args == null || typeof args !== 'object') return undefined;
  const spec =
    (args as Record<string, unknown>).generic_spec ?? (args as Record<string, unknown>).genericSpec;
  if (spec == null || typeof spec !== 'object') return undefined;
  const title = (spec as Record<string, unknown>).title;
  return typeof title === 'string' && title.trim() ? title : undefined;
}

// Frase de una acción del agente, con detalle cuando es útil.
function actionLabel(call: ActivityCall): string {
  const base = toolLabel(call.name);
  switch (call.name) {
    case 'add_widget': {
      const detail = genericTitle(call.args) ?? argString(call.args, 'widget_id', 'widgetId');
      return detail ? `${base}: ${detail}` : base;
    }
    case 'highlight_on_view': {
      const target = argString(call.args, 'target');
      return target ? `Resaltó «${target}»` : base;
    }
    case 'filter_view': {
      const query = argString(call.args, 'query');
      return query ? `Filtró por «${query}»` : base;
    }
    default:
      return base;
  }
}

// ¿La canvas op fue rechazada? El resultado llega como tool_result {accepted, reason} (/canvas-result).
function canvasRejected(result: ToolResult | undefined): boolean {
  if (!result || result.content == null || typeof result.content !== 'object') return false;
  return (result.content as { accepted?: boolean }).accepted === false;
}

interface AgentActivityProps {
  calls: ActivityCall[];
  resultsByCall?: Map<string, ToolResult> | undefined;
  /** Turno en curso: pasos en estado activo y secciones abiertas. */
  streaming: boolean;
}

function AgentActivity({ calls, resultsByCall, streaming }: AgentActivityProps) {
  const queries = calls.filter((c) => !isActionTool(c.name));
  const actions = calls.filter((c) => isActionTool(c.name));
  if (queries.length === 0 && actions.length === 0) return null;

  return (
    <div className="chat-activity">
      {queries.length > 0 && (
        <ChainOfThought defaultOpen={streaming}>
          <ChainOfThoughtHeader>{streaming ? 'Analizando…' : 'Análisis'}</ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            {queries.map((call, i) => (
              <ChainOfThoughtStep
                key={call.id ?? `q-${i}`}
                icon={Search}
                label={toolLabel(call.name)}
                status={streaming ? 'active' : 'complete'}
              />
            ))}
          </ChainOfThoughtContent>
        </ChainOfThought>
      )}
      {actions.length > 0 && (
        <Plan defaultOpen isStreaming={streaming}>
          <PlanHeader>
            <PlanTitle>
              {streaming ? 'Componiendo el dashboard…' : 'Cambios en el dashboard'}
            </PlanTitle>
            <PlanDescription>
              {actions.length === 1 ? '1 acción' : `${actions.length} acciones`}
            </PlanDescription>
            <PlanAction>
              <PlanTrigger />
            </PlanAction>
          </PlanHeader>
          <PlanContent>
            <Task defaultOpen>
              <TaskTrigger title={streaming ? 'Acciones en curso' : 'Acciones realizadas'} />
              <TaskContent>
                {actions.map((call, i) => {
                  const rejected = call.id ? canvasRejected(resultsByCall?.get(call.id)) : false;
                  return (
                    <TaskItem key={call.id ?? `a-${i}`}>
                      {actionLabel(call)}
                      {rejected ? ' — no aplicado' : ''}
                    </TaskItem>
                  );
                })}
              </TaskContent>
            </Task>
          </PlanContent>
        </Plan>
      )}
    </div>
  );
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
    <Message from="user">
      {editing ? (
        <MessageContent>
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
        </MessageContent>
      ) : (
        <>
          <MessageContent>{original}</MessageContent>
          {!isOptimistic && (
            <MessageActions>
              <MessageAction
                label="Editar y reenviar"
                disabled={disabled}
                onClick={() => {
                  setDraft(original);
                  setEditing(true);
                }}
              >
                <Pencil size={12} aria-hidden="true" />
              </MessageAction>
            </MessageActions>
          )}
        </>
      )}
    </Message>
  );
}

// ── Mensaje del asistente ─────────────────────────────────────────────────────────

interface AssistantMessageProps {
  message: ChatMessage;
  resultsByCall: Map<string, ToolResult>;
  disabled: boolean;
  onRegenerate: (assistantMessageId: string) => void;
}

function AssistantMessage({
  message,
  resultsByCall,
  disabled,
  onRegenerate,
}: AssistantMessageProps) {
  const text = messageText(message);
  const thinking = messageThinking(message);
  const calls = message.toolCalls ?? [];
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    navigator.clipboard?.writeText(text).then(
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
    <Message from="assistant">
      <MessageContent>
        {thinking && (
          <Reasoning isStreaming={false} defaultOpen={false}>
            <ReasoningTrigger />
            <ReasoningContent>{thinking}</ReasoningContent>
          </Reasoning>
        )}
        <AgentActivity calls={calls} resultsByCall={resultsByCall} streaming={false} />
        {text && <MessageResponse>{text}</MessageResponse>}
      </MessageContent>
      {text && (
        <MessageActions>
          <MessageAction
            onClick={copy}
            label={copied ? 'Copiado' : 'Copiar'}
            tooltip={copied ? 'Copiado' : 'Copiar'}
          >
            {copied ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Copy size={14} aria-hidden="true" />
            )}
          </MessageAction>
          <MessageAction
            disabled={disabled}
            onClick={() => onRegenerate(message.id)}
            label="Regenerar"
            tooltip="Regenerar"
          >
            <RefreshCw size={14} aria-hidden="true" />
          </MessageAction>
        </MessageActions>
      )}
    </Message>
  );
}

// ── Mensaje del asistente en streaming ───────────────────────────────────────────

interface StreamingMessageProps {
  streamingText: string;
  streamingReasoning: string;
  streamingToolCalls: { id: string; name: string; args: unknown }[];
}

function StreamingMessage({
  streamingText,
  streamingReasoning,
  streamingToolCalls,
}: StreamingMessageProps) {
  return (
    <Message from="assistant">
      <MessageContent>
        {streamingReasoning && (
          <Reasoning isStreaming={!streamingText}>
            <ReasoningTrigger />
            <ReasoningContent>{streamingReasoning}</ReasoningContent>
          </Reasoning>
        )}
        <AgentActivity calls={streamingToolCalls} streaming={true} />
        {streamingText ? (
          <>
            <MessageResponse>{streamingText}</MessageResponse>
            <span className="chat-cursor" aria-hidden="true" />
          </>
        ) : (
          !streamingReasoning && <Shimmer className="chat-messages__hint">Pensando</Shimmer>
        )}
      </MessageContent>
    </Message>
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

        {messages.map((message) => {
          if (message.role === 'tool') return null;
          if (message.role === 'user') {
            return (
              <UserBubble
                key={message.id}
                message={message}
                disabled={streaming}
                onEditAndResend={onEditAndResend}
              />
            );
          }

          return (
            <AssistantMessage
              key={message.id}
              message={message}
              resultsByCall={resultsByCall}
              disabled={streaming}
              onRegenerate={onRegenerate}
            />
          );
        })}

        {streaming && (
          <StreamingMessage
            streamingText={streamingText}
            streamingReasoning={streamingReasoning}
            streamingToolCalls={streamingToolCalls}
          />
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

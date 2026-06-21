import { ArrowDown, Check, ChevronRight, Copy, Pencil, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { ChatMessage, ToolCall, ToolResult } from '../../lib/chat.js';
import { ChatMarkdown } from './ChatMarkdown.js';
import { Loader } from './Loader.js';
import { Reasoning } from './Reasoning.js';
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

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ── Chip de tool-call ────────────────────────────────────────────────────────────

interface ToolChipProps {
  call: Pick<ToolCall, 'name' | 'args'>;
  result?: ToolResult | undefined;
  /** Sin resultado y conversación finalizada → abortado (gris). */
  aborted: boolean;
  /** En curso durante el streaming (spinner). */
  pending: boolean;
}

// Estado del tool-call (espejo de los estados de Tool de ai-elements).
const TOOL_BADGE: Record<'running' | 'completed' | 'error', string> = {
  running: 'En curso',
  completed: 'Hecho',
  error: 'Cancelado',
};
const TOOL_STATE_CLASS: Record<'running' | 'completed' | 'error', string> = {
  running: 'chat-tool-chip--pending',
  completed: 'chat-tool-chip--done',
  error: 'chat-tool-chip--aborted',
};

function ToolChip({ call, result, aborted, pending }: ToolChipProps) {
  const [open, setOpen] = useState(false);
  const state: 'running' | 'completed' | 'error' = pending
    ? 'running'
    : aborted
      ? 'error'
      : 'completed';

  return (
    <div className={`chat-tool-chip ${TOOL_STATE_CLASS[state]}`}>
      <button
        type="button"
        className="chat-tool-chip__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronRight
          size={13}
          className={`chat-tool-chip__caret${open ? ' is-open' : ''}`}
          aria-hidden="true"
        />
        <span className="chat-tool-chip__label">{toolLabel(call.name)}</span>
        <span className="chat-tool-chip__badge">
          {state === 'running' && <Loader size={11} />}
          {state === 'completed' && <Check size={12} aria-hidden="true" />}
          {TOOL_BADGE[state]}
        </span>
      </button>
      {open && (
        <div className="chat-tool-chip__body">
          <p className="chat-tool-chip__section">Parámetros</p>
          <pre className="chat-tool-chip__json">{prettyJson(call.args)}</pre>
          {result && (
            <>
              <p className="chat-tool-chip__section">Resultado</p>
              <pre className="chat-tool-chip__json">{prettyJson(result.content)}</pre>
            </>
          )}
        </div>
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
                className="chat-msg__action"
                disabled={disabled}
                onClick={() => {
                  setDraft(original);
                  setEditing(true);
                }}
              >
                <Pencil size={12} aria-hidden="true" /> Editar y reenviar
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Mensaje del asistente (texto plano a todo el ancho + acciones, estilo ai-elements) ──

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
    <div className="chat-msg chat-msg--assistant">
      {thinking && <Reasoning isStreaming={false}>{thinking}</Reasoning>}
      {calls.length > 0 && (
        <div className="chat-tool-chips">
          {calls.map((call) => {
            const result = resultsByCall.get(call.id);
            return (
              <ToolChip
                key={call.id}
                call={call}
                result={result}
                aborted={!result}
                pending={false}
              />
            );
          })}
        </div>
      )}
      {text && (
        <div className="chat-response chat-markdown">
          <ChatMarkdown>{text}</ChatMarkdown>
        </div>
      )}
      {text && (
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
            onClick={() => onRegenerate(message.id)}
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
          <div className="chat-msg chat-msg--assistant">
            {streamingReasoning && (
              <Reasoning isStreaming={!streamingText}>{streamingReasoning}</Reasoning>
            )}
            {streamingToolCalls.length > 0 && (
              <div className="chat-tool-chips">
                {streamingToolCalls.map((call) => (
                  <ToolChip
                    key={call.id}
                    call={{ name: call.name, args: call.args }}
                    aborted={false}
                    pending={!streamingText}
                  />
                ))}
              </div>
            )}
            {streamingText ? (
              <div className="chat-response chat-markdown">
                <ChatMarkdown>{streamingText}</ChatMarkdown>
                <span className="chat-cursor" aria-hidden="true" />
              </div>
            ) : (
              !streamingReasoning && <Shimmer className="chat-messages__hint">Pensando</Shimmer>
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

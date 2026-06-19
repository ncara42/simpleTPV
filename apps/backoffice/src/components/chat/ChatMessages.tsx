import { Check, ChevronRight, Pencil, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { ChatMessage, ToolCall, ToolResult } from '../../lib/chat.js';
import { toolLabel } from './toolLabels.js';

interface ChatMessagesProps {
  messages: ChatMessage[];
  loading: boolean;
  streaming: boolean;
  streamingText: string;
  streamingToolCalls: { id: string; name: string; args: unknown }[];
  onRegenerate: (assistantMessageId: string) => void;
  onEditAndResend: (userMessageId: string, newText: string) => void;
}

function messageText(message: ChatMessage): string {
  return message.content
    .filter((b) => b.type === 'text')
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

function ToolChip({ call, result, aborted, pending }: ToolChipProps) {
  const [open, setOpen] = useState(false);
  const stateClass = aborted
    ? 'chat-tool-chip--aborted'
    : pending
      ? 'chat-tool-chip--pending'
      : 'chat-tool-chip--done';

  return (
    <div className={`chat-tool-chip ${stateClass}`}>
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
        {pending ? (
          <span className="chat-tool-chip__spinner" aria-hidden="true" />
        ) : aborted ? null : (
          <Check size={13} className="chat-tool-chip__check" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div className="chat-tool-chip__body">
          <pre className="chat-tool-chip__json">{prettyJson(call.args)}</pre>
          {result && <pre className="chat-tool-chip__json">{prettyJson(result.content)}</pre>}
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

// ── Lista completa ────────────────────────────────────────────────────────────────

export function ChatMessages({
  messages,
  loading,
  streaming,
  streamingText,
  streamingToolCalls,
  onRegenerate,
  onEditAndResend,
}: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Autoscroll al final cuando entran tokens o mensajes nuevos.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, streaming]);

  const isEmpty = !loading && !streaming && messages.length === 0;

  return (
    <div className="chat-messages" ref={scrollRef}>
      {loading && <p className="chat-messages__hint">Cargando conversación…</p>}

      {isEmpty && (
        <div className="chat-messages__empty">
          <p>Pídele algo al asistente →</p>
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

        const text = messageText(message);
        const calls = message.toolCalls ?? [];
        return (
          <div key={message.id} className="chat-msg chat-msg--assistant">
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
              <div className="chat-bubble chat-bubble--assistant chat-markdown">
                <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
              </div>
            )}
            <div className="chat-msg__toolbar">
              <button
                type="button"
                className="chat-msg__action"
                disabled={streaming}
                onClick={() => onRegenerate(message.id)}
              >
                <RefreshCw size={12} aria-hidden="true" /> Regenerar
              </button>
            </div>
          </div>
        );
      })}

      {streaming && (
        <div className="chat-msg chat-msg--assistant">
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
          <div className="chat-bubble chat-bubble--assistant chat-markdown">
            {streamingText ? (
              <Markdown remarkPlugins={[remarkGfm]}>{streamingText}</Markdown>
            ) : (
              <span className="chat-messages__hint">Pensando…</span>
            )}
            <span className="chat-cursor" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}

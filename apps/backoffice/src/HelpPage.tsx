import './help.css';

import { usePageHeader } from '@simpletpv/ui';
import {
  ArrowUp,
  Check,
  CheckCheck,
  History,
  Loader2,
  Lock,
  Paperclip,
  Plus,
  X,
} from 'lucide-react';
import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ChatMarkdown } from './components/chat/ChatMarkdown.js';
import { viewContextFor } from './components/chat/view-context.js';
import { useSupportTickets } from './components/support/useSupportTickets.js';
import { usePageNav } from './lib/pageNav.js';
import type { SupportMessage, Ticket } from './lib/support.js';

type MsgStatus = 'sending' | 'received' | 'seen';

// ── Dot de estado del agente ──────────────────────────────────────────────────────

function TicketStatusDot({ status }: { status: 'online' | 'waiting' | 'closed' }) {
  const label = { online: 'Agente en línea', waiting: 'En espera', closed: 'Cerrado' }[status];
  return <span className={`ticket-agent-dot ticket-agent-dot--${status}`} aria-label={label} />;
}

// ── Icono de estado del mensaje (check / double-check) ────────────────────────────

function MsgStatusIcon({ status }: { status: MsgStatus }) {
  if (status === 'seen')
    return <CheckCheck size={12} className="msg-status msg-status--seen" aria-label="Visto" />;
  return (
    <Check
      size={12}
      className={`msg-status msg-status--${status}`}
      aria-label={status === 'received' ? 'Recibido' : 'Enviando'}
    />
  );
}

// ── Composer (textarea + enviar) ─────────────────────────────────────────────────

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
  placeholder: string;
  autoFocus?: boolean;
  canAttach?: boolean;
  onAttach?: (file: File) => void;
}

function Composer({
  value,
  onChange,
  onSubmit,
  pending,
  placeholder,
  autoFocus,
  canAttach,
  onAttach,
}: ComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const canSend = value.trim().length > 0 && !pending;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) onAttach?.(file);
    e.target.value = '';
  };

  return (
    <div className={`ticket-composer${canAttach ? ' ticket-composer--has-clip' : ''}`}>
      {canAttach && (
        <>
          <button
            type="button"
            className="ticket-composer-clip"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            aria-label="Adjuntar archivo"
          >
            <Paperclip size={17} aria-hidden="true" />
          </button>
          <input
            ref={fileRef}
            type="file"
            className="ticket-composer-file"
            onChange={handleFileChange}
            accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
            aria-hidden="true"
            tabIndex={-1}
          />
        </>
      )}
      <input
        className="ticket-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={pending}
        autoFocus={autoFocus}
        data-testid="help-search"
        enterKeyHint="send"
      />
      <button
        type="button"
        className="ticket-send"
        onClick={onSubmit}
        disabled={!canSend}
        aria-label="Enviar"
        data-testid="help-send"
      >
        {pending ? (
          <Loader2 size={16} className="ticket-spin" aria-hidden="true" />
        ) : (
          <ArrowUp size={16} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// ── Burbuja de mensaje ───────────────────────────────────────────────────────────

function Bubble({
  message,
  isFirstInBlock,
  status,
}: {
  message: SupportMessage;
  isFirstInBlock: boolean;
  status?: MsgStatus;
}) {
  const mine = message.author === 'user';
  const who = message.author === 'agent' ? 'Soporte' : message.author === 'ai' ? 'Asistente' : 'Tú';
  return (
    <div className={`ticket-msg ticket-msg--${mine ? 'user' : message.author}`}>
      {!mine && isFirstInBlock && <span className="ticket-msg-author">{who}</span>}
      <div className="ticket-msg-body">
        {mine ? message.body : <ChatMarkdown>{message.body}</ChatMarkdown>}
      </div>
      <div className="ticket-msg-meta">
        <span className="ticket-msg-time">{formatTime(message.createdAt)}</span>
        {mine && status !== undefined && <MsgStatusIcon status={status} />}
      </div>
    </div>
  );
}

// ── Dropdown historial ────────────────────────────────────────────────────────────

interface HistorialDropdownProps {
  tickets: Ticket[];
  selectedId: string | null;
  unread: ReadonlySet<string>;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}

function HistorialDropdown({
  tickets,
  selectedId,
  unread,
  anchorRef,
  onSelect,
  onNew,
  onClose,
}: HistorialDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const rect = anchorRef.current?.getBoundingClientRect();

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose, anchorRef]);

  return createPortal(
    <div
      ref={dropdownRef}
      className="historial-dropdown"
      style={{
        top: rect ? rect.bottom + 6 : 68,
        left: rect ? rect.left : 16,
      }}
      role="dialog"
      aria-label="Historial de consultas"
    >
      <button
        type="button"
        className="historial-new-btn"
        onClick={() => {
          onNew();
          onClose();
        }}
      >
        <Plus size={14} aria-hidden="true" />
        Nueva consulta
      </button>
      {tickets.length === 0 ? (
        <p className="historial-empty">Sin consultas previas</p>
      ) : (
        <div className="historial-list">
          {tickets.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`historial-item${t.id === selectedId ? ' is-active' : ''}`}
              onClick={() => {
                onSelect(t.id);
                onClose();
              }}
            >
              <span className="historial-item-meta">
                <span className="historial-item-num">#{t.number ?? '—'}</span>
                <span className={`ticket-badge ticket-badge--${t.status}`}>
                  {t.status === 'open' ? 'Abierto' : 'Cerrado'}
                </span>
                {unread.has(t.id) && (
                  <span className="ticket-unread" aria-label="Mensajes nuevos" />
                )}
              </span>
              <span className="historial-item-title">{t.title ?? 'Consulta'}</span>
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

// ── Página ───────────────────────────────────────────────────────────────────────

export function HelpPage() {
  usePageHeader('Ayuda', 'Soporte');

  const view = viewContextFor('help');
  const s = useSupportTickets();
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [historialOpen, setHistorialOpen] = useState(false);
  const historialBtnRef = useRef<HTMLButtonElement>(null);

  usePageNav(
    s.tickets.length > 0 ? (
      <button
        ref={historialBtnRef}
        type="button"
        className="help-history-btn"
        onClick={() => setHistorialOpen((o) => !o)}
        data-testid="help-history"
        aria-expanded={historialOpen}
      >
        <History size={15} aria-hidden="true" />
        Historial
      </button>
    ) : null,
  );

  const submit = (): void => {
    const text = draft.trim();
    if (!text) return;
    s.send(text);
    setDraft('');
    setAttachment(null);
  };

  const pickSuggestion = (text: string): void => {
    s.send(text);
    setDraft('');
  };

  const errorBanner = s.error && (
    <div className="help-error" role="alert">
      <span>{s.error}</span>
      <button type="button" onClick={s.dismissError} aria-label="Descartar error">
        ×
      </button>
    </div>
  );

  // Se omite el PRIMERO (es el título del ticket, no repetirlo en el hilo).
  const threadMessages = s.messages.slice(1);
  const open = s.selected?.status === 'open';
  const thinking =
    s.pending && s.messages.length > 0 && s.messages[s.messages.length - 1]?.author === 'user';

  const dotStatus =
    s.selected?.status === 'closed'
      ? 'closed'
      : s.selected?.mode === 'human'
        ? 'online'
        : 'waiting';

  const typingLabel = s.selected?.mode === 'human' ? 'Escribiendo…' : 'Pensando…';

  return (
    <section className="help-centered" data-testid="help-page">
      {historialOpen && (
        <HistorialDropdown
          tickets={s.tickets}
          selectedId={s.selectedId}
          unread={s.unread}
          anchorRef={historialBtnRef}
          onSelect={s.selectTicket}
          onNew={() => {
            s.startNew();
            setDraft('');
          }}
          onClose={() => setHistorialOpen(false)}
        />
      )}

      <main className="ticket-main">
        {s.selectedId === null ? (
          // ── Nueva consulta ──
          <section className="ticket-hero">
            <p className="ticket-hero-eyebrow">Centro de ayuda</p>
            <h1 className="ticket-hero-title">¿En qué podemos ayudarte?</h1>
            <p className="ticket-hero-subtitle">
              Pregunta lo que quieras sobre tu TPV y te respondo al momento. Si no puedo resolverlo,
              lo derivo a una persona del equipo. Soporte de lunes a viernes, de 9:00 a 19:00.
            </p>
            {errorBanner}
            <Composer
              value={draft}
              onChange={setDraft}
              onSubmit={submit}
              pending={s.pending}
              placeholder="Escribe tu pregunta..."
              autoFocus
            />
            <div className="ticket-chips">
              {view.suggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  className="ticket-chip"
                  onClick={() => pickSuggestion(sug)}
                  disabled={s.pending}
                >
                  {sug}
                </button>
              ))}
            </div>
          </section>
        ) : (
          // ── Ticket seleccionado ──
          <section className="ticket-view">
            <header className="ticket-view-head">
              <div className="ticket-view-title">
                <span className="ticket-view-num">#{s.selected?.number ?? '—'}</span>
                <h2>{s.selected?.title ?? 'Consulta'}</h2>
              </div>
              {s.selectedId && <TicketStatusDot status={dotStatus} />}
            </header>

            <div className="ticket-thread" data-testid="ticket-thread">
              {s.loadingThread ? (
                <p className="ticket-loading">
                  <Loader2 size={16} className="ticket-spin" aria-hidden="true" /> Cargando…
                </p>
              ) : (
                <>
                  {threadMessages.map((m, i) => {
                    const isFirstInBlock = i === 0 || threadMessages[i - 1]?.author !== m.author;
                    let msgStatus: MsgStatus | undefined;
                    if (m.author === 'user') {
                      const hasReply = threadMessages
                        .slice(i + 1)
                        .some((msg) => msg.author === 'ai' || msg.author === 'agent');
                      if (hasReply) {
                        msgStatus = 'seen';
                      } else if (m.id.startsWith('local-') && s.pending) {
                        msgStatus = 'sending';
                      } else {
                        msgStatus = 'received';
                      }
                    }
                    return (
                      <Bubble
                        key={m.id}
                        message={m}
                        isFirstInBlock={isFirstInBlock}
                        {...(msgStatus !== undefined && { status: msgStatus })}
                      />
                    );
                  })}
                  {thinking && (
                    <div className="ticket-msg ticket-msg--ai">
                      {(threadMessages.length === 0 ||
                        threadMessages[threadMessages.length - 1]?.author !== 'ai') && (
                        <span className="ticket-msg-author">Asistente</span>
                      )}
                      <div className="ticket-msg-body ticket-thinking" role="status">
                        <span className="ticket-thinking-dots" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                        {typingLabel}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {errorBanner}

            {open ? (
              <>
                {attachment && (
                  <div className="ticket-attachment-chip">
                    <Paperclip size={12} aria-hidden="true" />
                    <span className="ticket-attachment-name">{attachment.name}</span>
                    <button
                      type="button"
                      className="ticket-attachment-remove"
                      onClick={() => setAttachment(null)}
                      aria-label="Quitar adjunto"
                    >
                      <X size={11} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <Composer
                  value={draft}
                  onChange={setDraft}
                  onSubmit={submit}
                  pending={s.pending}
                  placeholder="Escribe un mensaje…"
                  canAttach={s.selected?.mode === 'human'}
                  onAttach={setAttachment}
                />
              </>
            ) : (
              <div className="ticket-closed-note" data-testid="ticket-closed-note">
                <Lock size={15} aria-hidden="true" />
                <span>Este ticket está cerrado.</span>
                <button
                  type="button"
                  className="ticket-closed-new"
                  onClick={() => {
                    s.startNew();
                    setDraft('');
                  }}
                >
                  Abrir una consulta nueva
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </section>
  );
}

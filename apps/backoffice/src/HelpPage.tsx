import './help.css';

import { usePageHeader } from '@simpletpv/ui';
import { ArrowUp, LifeBuoy, Loader2, Lock, Plus } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';

import { ChatMarkdown } from './components/chat/ChatMarkdown.js';
import { viewContextFor } from './components/chat/view-context.js';
import { useSupportTickets } from './components/support/useSupportTickets.js';
import type { SupportMessage, Ticket } from './lib/support.js';

// Hora relativa breve para la lista de tickets ("ahora", "hace 12 min", "hace 3 h"…).
function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

// ── Composer (textarea + enviar) ─────────────────────────────────────────────────

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
  placeholder: string;
  autoFocus?: boolean;
}

function Composer({ value, onChange, onSubmit, pending, placeholder, autoFocus }: ComposerProps) {
  const canSend = value.trim().length > 0 && !pending;
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  };
  return (
    <div className="ticket-composer">
      <textarea
        className="ticket-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
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

// ── Burbuja de mensaje ───────────────────────────────────────────────────────────

function Bubble({ message }: { message: SupportMessage }) {
  const mine = message.author === 'user';
  const who = message.author === 'agent' ? 'Soporte' : message.author === 'ai' ? 'Asistente' : 'Tú';
  return (
    <div className={`ticket-msg ticket-msg--${mine ? 'user' : message.author}`}>
      {!mine && <span className="ticket-msg-author">{who}</span>}
      <div className="ticket-msg-body">
        {mine ? message.body : <ChatMarkdown>{message.body}</ChatMarkdown>}
      </div>
    </div>
  );
}

// ── Sidebar: lista de tickets ──────────────────────────────────────────────────────

interface SidebarProps {
  tickets: Ticket[];
  selectedId: string | null;
  unread: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onNew: () => void;
}

function Sidebar({ tickets, selectedId, unread, onSelect, onNew }: SidebarProps) {
  return (
    <aside className="ticket-sidebar" data-testid="ticket-sidebar">
      <p className="ticket-sidebar-head">Tus consultas</p>
      <button type="button" className="ticket-new-btn" onClick={onNew} data-testid="ticket-new">
        <Plus size={16} aria-hidden="true" /> Nueva consulta
      </button>
      <div className="ticket-list">
        {tickets.length === 0 ? (
          <p className="ticket-empty">Aún no tienes consultas de soporte.</p>
        ) : (
          tickets.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`ticket-item${t.id === selectedId ? ' is-active' : ''}`}
              onClick={() => onSelect(t.id)}
            >
              <span className="ticket-item-top">
                <span className="ticket-item-num">#{t.number ?? '—'}</span>
                <span className={`ticket-badge ticket-badge--${t.status}`}>
                  {t.status === 'open' ? 'Abierto' : 'Cerrado'}
                </span>
                <span className="ticket-item-time">{formatRelative(t.updatedAt)}</span>
                {unread.has(t.id) && (
                  <span className="ticket-unread" aria-label="Mensajes nuevos" />
                )}
              </span>
              <span className="ticket-item-title">{t.title ?? 'Consulta'}</span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────────

export function HelpPage() {
  usePageHeader('Ayuda', 'Soporte');

  const view = viewContextFor('help');
  const s = useSupportTickets();
  const [draft, setDraft] = useState('');

  const submit = (): void => {
    const text = draft.trim();
    if (!text) return;
    s.send(text);
    setDraft('');
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

  // Mensajes a pintar: se omite el PRIMERO (es el título del ticket, ya mostrado en
  // la cabecera, para no repetir el texto).
  const threadMessages = s.messages.slice(1);
  const open = s.selected?.status === 'open';
  // Turno en vivo: tras enviar, el último mensaje es del usuario y esperamos respuesta.
  const thinking =
    s.pending && s.messages.length > 0 && s.messages[s.messages.length - 1]?.author === 'user';

  return (
    <section className="help-tickets" data-testid="help-page">
      <Sidebar
        tickets={s.tickets}
        selectedId={s.selectedId}
        unread={s.unread}
        onSelect={s.selectTicket}
        onNew={() => {
          s.startNew();
          setDraft('');
        }}
      />

      <main className="ticket-main">
        {s.selectedId === null ? (
          // ── Nueva consulta ──
          <section className="ticket-hero">
            <p className="ticket-hero-eyebrow">
              <LifeBuoy size={16} aria-hidden="true" /> Centro de ayuda
            </p>
            <h1 className="ticket-hero-title">¿En qué podemos ayudarte?</h1>
            <p className="ticket-hero-subtitle">
              Cuéntanos tu consulta. Te respondo al momento y, si no puedo resolverlo, lo derivo a
              una persona del equipo. Tu primer mensaje será el título del ticket.
            </p>
            {errorBanner}
            <Composer
              value={draft}
              onChange={setDraft}
              onSubmit={submit}
              pending={s.pending}
              placeholder="Escribe tu consulta…"
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
              <div className="ticket-view-actions">
                <span className={`ticket-badge ticket-badge--${s.selected?.status ?? 'open'}`}>
                  {open ? 'Abierto' : 'Cerrado'}
                </span>
                {open && (
                  <button
                    type="button"
                    className="ticket-close-btn"
                    onClick={s.closeSelected}
                    data-testid="ticket-close"
                  >
                    Cerrar ticket
                  </button>
                )}
              </div>
            </header>

            <div className="ticket-thread" data-testid="ticket-thread">
              {s.loadingThread ? (
                <p className="ticket-loading">
                  <Loader2 size={16} className="ticket-spin" aria-hidden="true" /> Cargando…
                </p>
              ) : (
                <>
                  {threadMessages.map((m) => (
                    <Bubble key={m.id} message={m} />
                  ))}
                  {thinking && (
                    <div className="ticket-msg ticket-msg--ai">
                      <span className="ticket-msg-author">Asistente</span>
                      <div className="ticket-msg-body ticket-thinking" role="status">
                        <span className="ticket-thinking-dots" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                        Pensando…
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {errorBanner}

            {open ? (
              <Composer
                value={draft}
                onChange={setDraft}
                onSubmit={submit}
                pending={s.pending}
                placeholder="Escribe un mensaje…"
              />
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

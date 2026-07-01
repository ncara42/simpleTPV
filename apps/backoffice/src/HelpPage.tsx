import './help.css';

import { usePageHeader } from '@simpletpv/ui';
import { ArrowUp, History, Loader2, Lock, Paperclip, Plus, X } from 'lucide-react';
import { type ChangeEvent, Fragment, type KeyboardEvent, useEffect, useRef, useState } from 'react';

// ── Sugerencias del carrusel hero (20 preguntas frecuentes) ─────────────────────
const HELP_SUGGESTIONS = [
  '¿Cómo funciona el TPV?',
  '¿Qué puedo hacer en el backoffice?',
  'Guía rápida de ventas',
  '¿Cómo gestiono el stock?',
  '¿Cómo añado un producto?',
  '¿Cómo creo una promoción?',
  '¿Cómo gestiono mis proveedores?',
  'Roles y permisos de usuarios',
  '¿Cómo funciona el control horario?',
  '¿Cómo configuro una tienda?',
  '¿Qué es VeriFactu?',
  '¿Cómo gestiono los traspasos?',
  '¿Cómo veo los informes de ventas?',
  '¿Cómo personalizo el tema?',
  '¿Cómo funciona el B2B?',
  'Alertas de stock bajas',
  '¿Cómo funciona el cierre de caja?',
  '¿Cómo añado un cliente?',
  '¿Qué es el ticket Z?',
  'Comparativa de ventas entre tiendas',
];
import { createPortal } from 'react-dom';

import { ChatMarkdown } from './components/chat/ChatMarkdown.js';
import { viewContextFor } from './components/chat/view-context.js';
import { useSupportTickets } from './components/support/useSupportTickets.js';
import { usePageNav } from './lib/pageNav.js';
import type { SupportMessage, Ticket } from './lib/support.js';
import { useTableShellHeight } from './lib/useTableShellHeight.js';

type MsgStatus = 'sending' | 'received' | 'seen';

// ── Dot de estado del agente ──────────────────────────────────────────────────────

function TicketStatusDot({ status }: { status: 'online' | 'waiting' | 'closed' }) {
  const label = { online: 'Agente en línea', waiting: 'En espera', closed: 'Cerrado' }[status];
  return <span className={`ticket-agent-dot ticket-agent-dot--${status}`} aria-label={label} />;
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

// ── Separador de fecha/hora entre bloques de mensajes ────────────────────────────

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function fmtDayTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} de ${MONTHS_ES[d.getMonth()]}, ${hh}:${mm}`;
}

function needsDivider(prevIso: string, curIso: string): boolean {
  const a = new Date(prevIso);
  const b = new Date(curIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  if (a.toDateString() !== b.toDateString()) return true;
  return b.getTime() - a.getTime() > 60 * 60 * 1000;
}

// ── Burbuja de mensaje ───────────────────────────────────────────────────────────

function Bubble({
  message,
  isFirstInBlock,
  isLast,
  status,
}: {
  message: SupportMessage;
  isFirstInBlock: boolean;
  isLast?: boolean;
  status?: MsgStatus;
}) {
  const mine = message.author === 'user';
  const who = message.author === 'agent' ? 'Soporte' : message.author === 'ai' ? 'Asistente' : 'Tú';
  const statusLabel =
    status === 'seen'
      ? 'Leído'
      : status === 'received'
        ? 'Entregado'
        : status === 'sending'
          ? 'Enviando…'
          : null;
  return (
    <div className={`ticket-msg ticket-msg--${mine ? 'user' : message.author}`}>
      {!mine && isFirstInBlock && <span className="ticket-msg-author">{who}</span>}
      <div className="ticket-msg-body">
        {mine ? message.body : <ChatMarkdown>{message.body}</ChatMarkdown>}
      </div>
      {isLast && mine && statusLabel && (
        <div className="ticket-msg-meta">
          <span className={`ticket-msg-status ticket-msg-status--${status}`}>{statusLabel}</span>
        </div>
      )}
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

// ── Carrusel de sugerencias (auto-scroll, pausa al hover) ────────────────────────

interface SuggestionsCarouselProps {
  onSelect: (s: string) => void;
  disabled?: boolean;
}

const CAROUSEL_DURATION = 120; // segundos para un ciclo completo

function SuggestionsCarousel({ onSelect, disabled }: SuggestionsCarouselProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // Posición en refs — sin getComputedStyle, sin desincronía con la animación
  const pos = useRef(0);
  const half = useRef(0);
  const paused = useRef(false);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, tx: 0, moved: false });

  const doubled = [...HELP_SUGGESTIONS, ...HELP_SUGGESTIONS];

  // Loop rAF en lugar de CSS animation
  useEffect(() => {
    let rafId: number;
    let lastTs: number | null = null;

    const tick = (ts: number) => {
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      if (!paused.current && !dragging.current && half.current > 0) {
        pos.current -= (half.current / CAROUSEL_DURATION) * dt;
        if (pos.current < -half.current) pos.current += half.current;
        if (trackRef.current) trackRef.current.style.transform = `translateX(${pos.current}px)`;
      }

      rafId = requestAnimationFrame(tick);
    };

    // Medir half tras el primer paint
    rafId = requestAnimationFrame(() => {
      if (trackRef.current) half.current = trackRef.current.scrollWidth / 2;
      rafId = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(rafId);
  }, []);

  // Drag en el documento
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      if (Math.abs(dx) > 4) dragStart.current.moved = true;
      pos.current = dragStart.current.tx + dx;
      if (trackRef.current) trackRef.current.style.transform = `translateX(${pos.current}px)`;
    };

    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      // Normalizar al rango [-half, 0)
      if (half.current > 0)
        pos.current = (((pos.current % half.current) + half.current) % half.current) - half.current;
      if (wrapRef.current && !wrapRef.current.matches(':hover')) paused.current = false;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const handleMouseEnter = () => {
    paused.current = true;
  };
  const handleMouseLeave = () => {
    if (!dragging.current) paused.current = false;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); // evita drag nativo del browser
    dragging.current = true;
    dragStart.current = { x: e.clientX, tx: pos.current, moved: false };
  };

  const handleChipClick = (sug: string) => () => {
    if (dragStart.current.moved) return;
    onSelect(sug);
  };

  return (
    <div
      ref={wrapRef}
      className="ticket-chips"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
    >
      <div ref={trackRef} className="ticket-chips-track">
        {doubled.map((sug, i) => (
          <button
            key={`${sug}-${i}`}
            type="button"
            className="ticket-chip"
            onClick={handleChipClick(sug)}
            disabled={disabled}
            draggable={false}
          >
            {sug}
          </button>
        ))}
      </div>
    </div>
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
  const shellHeight = useTableShellHeight();

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
    <section className="help-centered" data-testid="help-page" style={{ height: shellHeight }}>
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
            <div className="ticket-hero-body">
              <p className="ticket-hero-eyebrow">Centro de ayuda</p>
              <h1 className="ticket-hero-title">¿En qué podemos ayudarte?</h1>
              <p className="ticket-hero-subtitle">
                Pregunta lo que necesites y te respondemos al momento. Si no podemos resolverlo o
                quieres pedir una funcionalidad nueva, lo escalamos al equipo. Atención de lunes a
                domingo, de 9 a 22h.
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
              <SuggestionsCarousel onSelect={pickSuggestion} disabled={s.pending} />
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
                    const isLast = i === threadMessages.length - 1;
                    const isFirstInBlock = i === 0 || threadMessages[i - 1]?.author !== m.author;
                    const prev = threadMessages[i - 1];
                    const showDivider = !prev || needsDivider(prev.createdAt, m.createdAt);
                    let msgStatus: MsgStatus | undefined;
                    if (isLast && m.author === 'user') {
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
                      <Fragment key={m.id}>
                        {showDivider && (
                          <div className="ticket-daydiv">
                            <span>{fmtDayTime(m.createdAt)}</span>
                          </div>
                        )}
                        <Bubble
                          message={m}
                          isFirstInBlock={isFirstInBlock}
                          isLast={isLast}
                          {...(msgStatus !== undefined && { status: msgStatus })}
                        />
                      </Fragment>
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

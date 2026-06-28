import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';

import { RESIZE_DIRS, useFloatingWindow, type WindowRect } from '../hooks/use-floating-window.js';
import { fileToCompressedDataUrl } from '../lib/image.js';

// Chat de traspaso entre central ('central', backoffice) y la tienda que recibe
// ('store', el dependiente). Réplica del lenguaje visual del chatbot (panel glass,
// burbujas, composer, acciones por mensaje copiar/editar/borrar) SIN nada de IA.
// Compartido por backoffice y TPV: cada app le pasa `side`, los mensajes y los handlers.

export type TransferChatSide = 'store' | 'central';

export interface TransferChatMessage {
  id: string;
  author: TransferChatSide;
  body: string | null;
  dataUrl: string | null;
  createdAt: string;
}

export interface TransferChatProps {
  open: boolean;
  onClose: () => void;
  /** Lado del usuario actual: sus mensajes van a la derecha. */
  side: TransferChatSide;
  messages: TransferChatMessage[];
  onSend: (input: { body?: string; dataUrl?: string }) => void | Promise<void>;
  /** Edita el texto de un mensaje (omitir para ocultar el botón Editar). */
  onEdit?: ((id: string, body: string) => void) | undefined;
  /** Borra un mensaje (omitir para ocultar el botón Borrar). */
  onDelete?: ((id: string) => void) | undefined;
  title?: string;
  subtitle?: string | undefined;
  loading?: boolean;
  sending?: boolean;
  emptyHint?: string;
  /** Franja opcional bajo la cabecera (p. ej. «¿Solucionado? Sí»). */
  banner?: ReactNode;
  testId?: string;
}

export function TransferChat({
  open,
  onClose,
  side,
  messages,
  onSend,
  onEdit,
  onDelete,
  title = 'Conversación',
  subtitle,
  loading = false,
  sending = false,
  emptyHint = 'Sin mensajes todavía. Escribe el primero.',
  banner,
  testId,
}: TransferChatProps) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [rect, setRect] = useState<WindowRect>(initialRect);
  const { startMove, startResize } = useFloatingWindow(rect, setRect);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Autoscroll al fondo al abrir y al llegar mensajes nuevos.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages.length, loading]);

  if (!open) return null;

  const canSend = !sending && !compressing && (text.trim() !== '' || photo != null);

  async function pickPhoto(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file) return;
    setCompressing(true);
    try {
      setPhoto(await fileToCompressedDataUrl(file));
    } catch (err) {
      console.warn('No se pudo procesar la foto', err);
    } finally {
      setCompressing(false);
    }
  }

  async function send(): Promise<void> {
    if (!canSend) return;
    const body = text.trim();
    const input: { body?: string; dataUrl?: string } = {};
    if (body) input.body = body;
    if (photo) input.dataUrl = photo;
    await onSend(input);
    setText('');
    setPhoto(null);
  }

  function copy(id: string, body: string): void {
    void navigator.clipboard?.writeText(body);
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
  }

  function startEdit(m: TransferChatMessage): void {
    setEditId(m.id);
    setEditDraft(m.body ?? '');
  }

  function saveEdit(): void {
    const body = editDraft.trim();
    if (editId && body && onEdit) onEdit(editId, body);
    setEditId(null);
  }

  return (
    <div className="tc-root" data-testid={testId}>
      {/* Backdrop transparente: clic fuera cierra (como el ChatDock); no oscurece la página. */}
      <div className="tc-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="tc-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      >
        {/* Cabecera = asa de arrastre: mueve la ventana por toda la pantalla (los botones
            internos no arrastran; lo gestiona useFloatingWindow). */}
        <header className="tc-head tc-drag" onPointerDown={startMove}>
          <span className="tc-avatar" aria-hidden="true">
            {side === 'central' ? 'T' : 'C'}
          </span>
          <div className="tc-head-info">
            <span className="tc-title">{title}</span>
            {subtitle && <span className="tc-sub">{subtitle}</span>}
          </div>
          <button type="button" className="tc-iconbtn" onClick={onClose} aria-label="Cerrar">
            <IconX />
          </button>
        </header>

        {banner}

        <div className="tc-scroll" ref={scrollRef}>
          {loading ? (
            <p className="tc-state">Cargando…</p>
          ) : messages.length === 0 ? (
            <p className="tc-state">{emptyHint}</p>
          ) : (
            messages.map((m, i) => {
              const own = m.author === side;
              const prev = messages[i - 1];
              const divider = !prev || needsDivider(prev.createdAt, m.createdAt);
              const day = divider ? (
                <div className="tc-daydiv">
                  <span>{fmtDayTime(m.createdAt)}</span>
                </div>
              ) : null;
              if (editId === m.id) {
                return (
                  <Fragment key={m.id}>
                    {day}
                    <div className={`tc-msg ${own ? 'tc-msg--own' : 'tc-msg--peer'}`}>
                      <div className="tc-edit">
                        <textarea
                          className="tc-edit-area"
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={Math.min(6, Math.max(2, editDraft.split('\n').length))}
                          autoFocus
                        />
                        <div className="tc-edit-actions">
                          <button
                            type="button"
                            className="tc-edit-cancel"
                            onClick={() => setEditId(null)}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className="tc-edit-save"
                            onClick={saveEdit}
                            disabled={editDraft.trim() === ''}
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    </div>
                  </Fragment>
                );
              }
              return (
                <Fragment key={m.id}>
                  {day}
                  <div
                    className={`tc-msg ${own ? 'tc-msg--own' : 'tc-msg--peer'}`}
                    data-testid="tc-message"
                  >
                    <div className="tc-bubble">
                      {m.dataUrl && (
                        <button
                          type="button"
                          className="tc-photo"
                          onClick={() => setLightbox(m.dataUrl)}
                          title="Ver foto"
                        >
                          <img src={m.dataUrl} alt="Foto del mensaje" loading="lazy" />
                        </button>
                      )}
                      {m.body && <span className="tc-text">{m.body}</span>}
                    </div>
                    <div className="tc-msg-tools">
                      {m.body && (
                        <button
                          type="button"
                          className="tc-msg-act"
                          onClick={() => copy(m.id, m.body!)}
                          title="Copiar"
                          aria-label="Copiar"
                        >
                          {copiedId === m.id ? <IconCheck /> : <IconCopy />}
                        </button>
                      )}
                      {m.body && onEdit && (
                        <button
                          type="button"
                          className="tc-msg-act"
                          onClick={() => startEdit(m)}
                          title="Editar"
                          aria-label="Editar"
                        >
                          <IconPencil />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          className="tc-msg-act"
                          onClick={() => onDelete(m.id)}
                          title="Borrar"
                          aria-label="Borrar"
                        >
                          <IconTrash />
                        </button>
                      )}
                    </div>
                  </div>
                </Fragment>
              );
            })
          )}
        </div>

        <div className="tc-composer">
          {photo && (
            <div className="tc-staged">
              <img src={photo} alt="Foto a enviar" />
              <button
                type="button"
                className="tc-staged-del"
                onClick={() => setPhoto(null)}
                aria-label="Quitar foto"
              >
                <IconX small />
              </button>
            </div>
          )}
          <div className="tc-input-row">
            <label className="tc-attach" title="Adjuntar foto">
              <IconClip />
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  void pickPhoto(e.target.files);
                  e.target.value = '';
                }}
                data-testid="tc-photo-input"
              />
            </label>
            <textarea
              className="tc-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={compressing ? 'Procesando foto…' : 'Escribe un mensaje…'}
              rows={1}
              data-testid="tc-input"
            />
            <button
              type="button"
              className="tc-send"
              disabled={!canSend}
              onClick={() => void send()}
              aria-label="Enviar"
              data-testid="tc-send"
            >
              <IconSend />
            </button>
          </div>
        </div>

        {lightbox && (
          <div className="tc-lightbox" onClick={() => setLightbox(null)}>
            <img src={lightbox} alt="Foto" />
          </div>
        )}

        {/* Asas de redimensión: 4 bordes + 4 esquinas (igual que el ChatDock). */}
        {RESIZE_DIRS.map((dir) => (
          <div
            key={dir}
            className={`tc-resize tc-resize--${dir}`}
            onPointerDown={startResize(dir)}
            aria-hidden="true"
          />
        ))}
      </aside>
    </div>
  );
}

function initialRect(): WindowRect {
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const w = Math.min(440, vw - 32);
  const h = Math.min(660, vh - 32);
  return {
    w,
    h,
    x: Math.max(16, Math.round((vw - w) / 2)),
    y: Math.max(16, Math.round((vh - h) / 2)),
  };
}

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

/** Separador estilo Instagram: «2 de julio, 22:21». */
function fmtDayTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} de ${MONTHS_ES[d.getMonth()]}, ${hh}:${mm}`;
}

/** Inserta un separador cuando cambia el día o hay más de 1 h de hueco. */
function needsDivider(prevIso: string, curIso: string): boolean {
  const a = new Date(prevIso);
  const b = new Date(curIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  if (a.toDateString() !== b.toDateString()) return true;
  return b.getTime() - a.getTime() > 60 * 60 * 1000;
}

function Svg({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function IconX({ small = false }: { small?: boolean }) {
  return (
    <Svg size={small ? 12 : 18}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  );
}

function IconClip() {
  return (
    <Svg size={18}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </Svg>
  );
}

function IconSend() {
  return (
    <Svg size={17}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Svg>
  );
}

function IconCopy() {
  return (
    <Svg size={14}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </Svg>
  );
}

function IconCheck() {
  return (
    <Svg size={14}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

function IconPencil() {
  return (
    <Svg size={14}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  );
}

function IconTrash() {
  return (
    <Svg size={14}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

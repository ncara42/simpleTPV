import { useEffect, useRef, useState } from 'react';

import { RESIZE_DIRS, useFloatingWindow, type WindowRect } from '../hooks/use-floating-window.js';
import { fileToCompressedDataUrl } from '../lib/image.js';

// Chat de traspaso entre central ('central', backoffice) y la tienda que recibe
// ('store', el dependiente). Réplica del lenguaje visual del chatbot (panel glass,
// burbujas, composer) SIN nada de IA. Compartido por backoffice y TPV: cada app le pasa
// `side` (su lado), los mensajes y el `onSend`; el componente sólo pinta y compone.

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
  title?: string;
  subtitle?: string | undefined;
  loading?: boolean;
  sending?: boolean;
  emptyHint?: string;
  testId?: string;
}

export function TransferChat({
  open,
  onClose,
  side,
  messages,
  onSend,
  title = 'Conversación',
  subtitle,
  loading = false,
  sending = false,
  emptyHint = 'Sin mensajes todavía. Escribe el primero.',
  testId,
}: TransferChatProps) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
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

        <div className="tc-scroll" ref={scrollRef}>
          {loading ? (
            <p className="tc-state">Cargando…</p>
          ) : messages.length === 0 ? (
            <p className="tc-state">{emptyHint}</p>
          ) : (
            messages.map((m) => {
              const own = m.author === side;
              return (
                <div
                  key={m.id}
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
                  <time className="tc-time">{fmtTime(m.createdAt)}</time>
                </div>
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
              <IconCamera />
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

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function IconX({ small = false }: { small?: boolean }) {
  const s = small ? 12 : 18;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function IconCamera() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

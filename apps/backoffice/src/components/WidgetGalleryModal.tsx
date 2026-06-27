import './widget-gallery-modal.css';

import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { GALLERY_CATEGORIES, GALLERY_ENTRIES } from '../widgets/gallery-catalog.js';

export interface WidgetGalleryModalProps {
  /** Ids de widgets disponibles (catálogo − los ya presentes en el lienzo). */
  availableIds: string[];
  /** Añade el widget elegido al lienzo. */
  onPick: (widgetId: string) => void;
  onClose: () => void;
}

// Selector gráfico «Añadir widget»: modal centrado con carril de categorías (las 11 secciones del
// handoff) y rejilla de tarjetas con miniatura. Sustituye a la lista de texto de `WidgetPalette` en
// el botón «+» de la topbar. Cierra con Escape o clic en el fondo.
export function WidgetGalleryModal({ availableIds, onPick, onClose }: WidgetGalleryModalProps) {
  const available = useMemo(() => new Set(availableIds), [availableIds]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  // Recuento de widgets por categoría (para el badge del carril).
  const countByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of GALLERY_ENTRIES) m.set(e.category, (m.get(e.category) ?? 0) + 1);
    return m;
  }, []);

  // Categoría activa inicial: la primera con contenido (evita abrir en una vacía).
  const firstWithContent =
    GALLERY_CATEGORIES.find((c) => (countByCat.get(c.id) ?? 0) > 0)?.id ??
    GALLERY_CATEGORIES[0]!.id;
  const [activeCat, setActiveCat] = useState(firstWithContent);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (q) {
      return GALLERY_ENTRIES.filter(
        (e) => e.label.toLowerCase().includes(q) || e.description.toLowerCase().includes(q),
      );
    }
    return GALLERY_ENTRIES.filter((e) => e.category === activeCat);
  }, [q, activeCat]);

  return createPortal(
    <div className="wg-overlay" role="presentation" onPointerDown={onClose}>
      <div
        className="wg-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Añadir widget al panel"
        data-testid="widget-gallery-modal"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="wg-head">
          <div className="wg-head-titles">
            <span className="wg-eyebrow">Panel</span>
            <h2 className="wg-title">Añadir widget</h2>
          </div>
          <button type="button" className="wg-close" aria-label="Cerrar" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="wg-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="wg-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar widget…"
            aria-label="Buscar widget"
            data-testid="widget-gallery-search"
          />
        </div>

        <div className="wg-body">
          <nav className="wg-rail" aria-label="Categorías">
            {GALLERY_CATEGORIES.map((c) => {
              const n = countByCat.get(c.id) ?? 0;
              const isActive = !q && c.id === activeCat;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`wg-rail-item${isActive ? ' is-active' : ''}`}
                  data-testid={`widget-gallery-cat-${c.id}`}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => {
                    setActiveCat(c.id);
                    setQuery('');
                  }}
                >
                  <span className="wg-rail-num">{c.num}</span>
                  <span className="wg-rail-label">{c.label}</span>
                  {n > 0 && <span className="wg-rail-count">{n}</span>}
                </button>
              );
            })}
          </nav>

          <div className="wg-content">
            {visible.length === 0 ? (
              <p className="wg-empty">
                {q
                  ? `Sin resultados para «${query}».`
                  : 'Aún no hay widgets en esta categoría. Llegarán en próximas tandas.'}
              </p>
            ) : (
              <ul className="wg-grid">
                {visible.map((e) => {
                  const added = !available.has(e.id);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        className="wg-card"
                        data-testid={`widget-gallery-card-${e.id}`}
                        disabled={added}
                        aria-label={added ? `${e.label} (ya añadido)` : `Añadir ${e.label}`}
                        onClick={() => onPick(e.id)}
                      >
                        <span className="wg-card-thumb">{e.thumbnail}</span>
                        <span className="wg-card-meta">
                          <span className="wg-card-title">{e.label}</span>
                          <span className="wg-card-sub">{e.description}</span>
                        </span>
                        {added && <span className="wg-card-added">Añadido</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

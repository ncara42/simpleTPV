import { Input } from '@simpletpv/ui';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface WidgetPaletteProps {
  /** Ids de widgets disponibles para añadir (catálogo − presentes). */
  items: string[];
  /** Etiqueta legible de un widget. */
  label: (widgetId: string) => string;
  onPick: (widgetId: string) => void;
  onClose: () => void;
  /** Variante de posición: anclada al botón (toolbar), centrada (estado vacío) o fija bajo el
   *  clúster derecho del topbar (botón «+» de añadir widget). */
  variant?: 'anchored' | 'center' | 'topbar';
}

// Popover de "añadir widget" con buscador: filtra el catálogo por nombre y lo añade al lienzo.
// Cierra al pulsar Escape o al hacer clic fuera.
export function WidgetPalette({
  items,
  label,
  onPick,
  onClose,
  variant = 'anchored',
}: WidgetPaletteProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const withLabels = items.map((id) => ({ id, label: label(id) }));
    if (!q) return withLabels;
    return withLabels.filter((it) => it.label.toLowerCase().includes(q));
  }, [items, label, query]);

  return (
    <div
      ref={ref}
      className={`dash-free-palette dash-free-palette--${variant}`}
      role="menu"
      aria-label="Añadir widget"
    >
      <div className="dash-free-palette-search">
        <Search size={15} aria-hidden="true" />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar widget…"
          aria-label="Buscar widget"
          data-testid="dash-free-palette-search"
        />
      </div>
      {items.length === 0 ? (
        <p className="dash-free-palette-empty">Ya has añadido todos los widgets.</p>
      ) : filtered.length === 0 ? (
        <p className="dash-free-palette-empty">Sin resultados para «{query}».</p>
      ) : (
        <ul className="dash-free-palette-list">
          {filtered.map((it) => (
            <li key={it.id}>
              <button type="button" role="menuitem" onClick={() => onPick(it.id)}>
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

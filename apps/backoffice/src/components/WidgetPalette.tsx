import { useEffect, useRef } from 'react';

export interface WidgetPaletteProps {
  /** Ids de widgets disponibles para añadir (catálogo − presentes). */
  items: string[];
  /** Etiqueta legible de un widget. */
  label: (widgetId: string) => string;
  onPick: (widgetId: string) => void;
  onClose: () => void;
}

// Popover de "añadir widget": lista los widgets del catálogo que aún no están en el lienzo.
// Cierra al pulsar Escape o al hacer clic fuera.
export function WidgetPalette({ items, label, onPick, onClose }: WidgetPaletteProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
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

  return (
    <div ref={ref} className="dash-free-palette" role="menu" aria-label="Añadir widget">
      {items.length === 0 ? (
        <p className="dash-free-palette-empty">Ya has añadido todos los widgets.</p>
      ) : (
        <ul className="dash-free-palette-list">
          {items.map((id) => (
            <li key={id}>
              <button type="button" role="menuitem" onClick={() => onPick(id)}>
                {label(id)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

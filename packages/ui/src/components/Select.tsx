import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Contador opcional alineado a la derecha de la opción (p. ej. nº de items). */
  count?: number;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Si se indica, el disparador muestra este texto fijo en vez de la opción seleccionada. */
  triggerLabel?: string;
  /** Nodo React para el disparador; permite texto coloreado o iconos. Tiene prioridad sobre triggerLabel. */
  triggerNode?: ReactNode;
  /** Contador opcional alineado junto al chevron del disparador. */
  triggerCount?: number;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  'data-testid'?: string;
}

/**
 * Desplegable propio (no nativo del SO), estilo Apple: disparador con chevron
 * + menú flotante con hairline, sombra suave y check en la opción activa.
 * Accesible por teclado (Enter/Espacio/flechas/Esc/Home/End) y type-ahead.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar…',
  triggerLabel,
  triggerNode,
  triggerCount,
  className,
  disabled,
  ariaLabel,
  'data-testid': testid,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef<{ query: string; at: number }>({ query: '', at: 0 });
  const listboxId = useId();
  // El menú se renderiza en un portal (document.body) para no quedar recortado
  // por ancestros con overflow:hidden (p. ej. el árbol de Familias). Posición fija
  // calculada desde el disparador; abre hacia abajo o hacia arriba según el hueco,
  // y se ancla al borde derecho del trigger cuando sobresaldría por la derecha.
  const [menuPos, setMenuPos] = useState<{
    left: number | 'auto';
    right: number | 'auto';
    width: number;
    top: number | 'auto';
    bottom: number | 'auto';
    maxHeight: number;
  } | null>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
  const selectedIndex = useMemo(
    () => options.findIndex((o) => o.value === value),
    [options, value],
  );

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [disabled, selectedIndex]);

  const commit = useCallback(
    (index: number) => {
      const opt = options[index];
      if (!opt || opt.disabled) return;
      onChange(opt.value);
      close();
      rootRef.current?.querySelector<HTMLButtonElement>('.ui-select-trigger')?.focus();
    },
    [options, onChange, close],
  );

  // Cerrar al hacer click fuera (el menú vive en un portal: comprobar ambos nodos)
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !listRef.current?.contains(t)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  // Posicionar el menú flotante respecto al disparador (y recalcular al hacer
  // scroll o resize mientras está abierto).
  const updatePosition = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 6;
    const maxH = 288; // 18rem
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    // Abre hacia abajo salvo que no quepa y arriba haya más sitio.
    const below = spaceBelow >= Math.min(maxH, 220) || spaceBelow >= spaceAbove;
    // Ancla al borde derecho del trigger cuando abrir desde la izquierda sobresaldría.
    // 240px = anchura mínima razonable del menú (las opciones pueden ser largas).
    const minMenuW = Math.max(rect.width, 240);
    const alignRight = rect.left + minMenuW + margin > window.innerWidth;
    setMenuPos({
      // 'auto' explícito es necesario: anula el `left:0` del CSS de la clase.
      left: alignRight ? 'auto' : rect.left,
      right: alignRight ? window.innerWidth - rect.right : 'auto',
      width: rect.width,
      top: below ? rect.bottom + margin : 'auto',
      bottom: below ? 'auto' : window.innerHeight - rect.top + margin,
      maxHeight: Math.max(120, Math.min(maxH, below ? spaceBelow : spaceAbove)),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updatePosition();
    const handler = () => updatePosition();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open, updatePosition]);

  // Mantener la opción activa a la vista
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const moveActive = useCallback(
    (dir: 1 | -1) => {
      setActiveIndex((prev) => {
        const n = options.length;
        let i = prev;
        for (let step = 0; step < n; step++) {
          i = (i + dir + n) % n;
          if (!options[i]?.disabled) return i;
        }
        return prev;
      });
    },
    [options],
  );

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(options.findIndex((o) => !o.disabled));
        break;
      case 'End':
        e.preventDefault();
        for (let i = options.length - 1; i >= 0; i--) {
          if (!options[i]?.disabled) {
            setActiveIndex(i);
            break;
          }
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex >= 0) commit(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Tab':
        close();
        break;
      default:
        // Type-ahead
        if (e.key.length === 1) {
          const now = Date.now();
          const ta = typeahead.current;
          ta.query = now - ta.at > 600 ? e.key : ta.query + e.key;
          ta.at = now;
          const q = ta.query.toLowerCase();
          const idx = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(q));
          if (idx >= 0) setActiveIndex(idx);
        }
    }
  };

  return (
    <div className={`ui-select${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        type="button"
        className="ui-select-trigger"
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-testid={testid}
      >
        <span className={`ui-select-value${selected || triggerLabel ? '' : ' is-placeholder'}`}>
          {triggerNode ?? triggerLabel ?? (selected ? selected.label : placeholder)}
        </span>
        {triggerCount != null && <span className="ui-select-trigger-count">{triggerCount}</span>}
        <svg
          className="ui-select-chevron"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open &&
        menuPos &&
        createPortal(
          <ul
            className="ui-select-menu"
            role="listbox"
            id={listboxId}
            ref={listRef}
            tabIndex={-1}
            data-has-selection={value ? 'true' : undefined}
            style={{
              position: 'fixed',
              // 'auto' explícito anula el left:0 del CSS clase; undefined lo dejaría colar.
              left: menuPos.left === 'auto' ? 'auto' : menuPos.left,
              right: menuPos.right === 'auto' ? undefined : menuPos.right,
              top: menuPos.top,
              bottom: menuPos.bottom,
              minWidth: menuPos.width,
              maxHeight: menuPos.maxHeight,
            }}
          >
            {options.map((opt, i) => (
              <li
                key={opt.value}
                role="option"
                data-value={opt.value}
                aria-selected={opt.value === value}
                aria-disabled={opt.disabled}
                className={`ui-select-option${i === activeIndex ? ' is-active' : ''}${
                  opt.value === value ? ' is-selected' : ''
                }${opt.disabled ? ' is-disabled' : ''}`}
                onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                onClick={() => commit(i)}
              >
                <span className="ui-select-option-label">{opt.label}</span>
                {opt.count != null && <span className="ui-select-option-count">{opt.count}</span>}
                {opt.value === value && (
                  <svg
                    className="ui-select-check"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}

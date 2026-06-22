import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { SelectOption } from './Select.js';

export interface MultiSelectProps {
  /** Valores seleccionados (orden no significativo). */
  values: string[];
  onChange: (values: string[]) => void;
  options: SelectOption[];
  /** Texto del disparador cuando no hay nada seleccionado (equivale a "todas"). */
  placeholder?: string;
  /** Texto de la acción que limpia la selección dentro del menú. */
  clearLabel?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  'data-testid'?: string;
}

/**
 * Desplegable de selección MÚLTIPLE (S-14): mismo lenguaje visual que `Select`
 * (disparador + menú flotante en portal) pero con checkboxes y chips. Abre por
 * click; togglear una opción NO cierra el menú. Accesible por teclado
 * (Espacio/Enter togglean, flechas mueven, Esc cierra). Selección vacía = "todas".
 *
 * No comparte CSS con `Select` (clases `ui-multiselect-*` en `multiselect.css`),
 * para no alterar el `Select` que usa el TPV.
 */
export function MultiSelect({
  values,
  onChange,
  options,
  placeholder = 'Todas',
  clearLabel = 'Todas',
  className,
  disabled,
  ariaLabel,
  'data-testid': testid,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const [menuPos, setMenuPos] = useState<{
    left: number;
    width: number;
    top: number | 'auto';
    bottom: number | 'auto';
    maxHeight: number;
  } | null>(null);

  const selectedSet = useMemo(() => new Set(values), [values]);
  const selectedOptions = useMemo(
    () => options.filter((o) => selectedSet.has(o.value)),
    [options, selectedSet],
  );

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setActiveIndex(0);
  }, [disabled]);

  const toggle = useCallback(
    (index: number) => {
      const opt = options[index];
      if (!opt || opt.disabled) return;
      const next = new Set(values);
      if (next.has(opt.value)) next.delete(opt.value);
      else next.add(opt.value);
      // Conserva el orden de `options` para una salida estable.
      onChange(options.filter((o) => next.has(o.value)).map((o) => o.value));
    },
    [options, values, onChange],
  );

  const removeValue = useCallback(
    (value: string) => onChange(values.filter((v) => v !== value)),
    [values, onChange],
  );

  // Cerrar al hacer click fuera (menú en portal: comprobar ambos nodos).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !listRef.current?.contains(t)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  const updatePosition = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 6;
    const maxH = 288;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const below = spaceBelow >= Math.min(maxH, 220) || spaceBelow >= spaceAbove;
    setMenuPos({
      left: rect.left,
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

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const moveActive = useCallback(
    (dir: 1 | -1) => {
      setActiveIndex((prev) => {
        const n = options.length;
        if (n === 0) return prev;
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
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex >= 0) toggle(activeIndex); // togglea sin cerrar
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Tab':
        close();
        break;
    }
  };

  const hasSelection = selectedOptions.length > 0;

  return (
    <div className={`ui-multiselect${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        type="button"
        className="ui-multiselect-trigger"
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-testid={testid}
      >
        {hasSelection ? (
          <span className="ui-multiselect-chips">
            {selectedOptions.map((opt) => (
              <span key={opt.value} className="ui-multiselect-chip" data-value={opt.value}>
                <span className="ui-multiselect-chip-label">{opt.label}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  className="ui-multiselect-chip-remove"
                  aria-label={`Quitar ${opt.label}`}
                  data-testid={testid ? `${testid}-remove-${opt.value}` : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeValue(opt.value);
                  }}
                >
                  ×
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span className="ui-multiselect-value is-placeholder">{placeholder}</span>
        )}
        <svg
          className="ui-multiselect-chevron"
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
            className="ui-multiselect-menu"
            role="listbox"
            aria-multiselectable="true"
            id={listboxId}
            ref={listRef}
            tabIndex={-1}
            style={{
              position: 'fixed',
              left: menuPos.left,
              top: menuPos.top,
              bottom: menuPos.bottom,
              minWidth: menuPos.width,
              maxHeight: menuPos.maxHeight,
            }}
          >
            <li
              role="option"
              aria-selected={!hasSelection}
              className={`ui-multiselect-option ui-multiselect-clear${hasSelection ? '' : ' is-selected'}`}
              data-testid={testid ? `${testid}-clear` : undefined}
              onClick={() => onChange([])}
            >
              <span className="ui-multiselect-option-label">{clearLabel}</span>
            </li>
            {options.map((opt, i) => {
              const checked = selectedSet.has(opt.value);
              return (
                <li
                  key={opt.value}
                  role="option"
                  data-value={opt.value}
                  aria-selected={checked}
                  aria-disabled={opt.disabled}
                  className={`ui-multiselect-option${i === activeIndex ? ' is-active' : ''}${
                    checked ? ' is-selected' : ''
                  }${opt.disabled ? ' is-disabled' : ''}`}
                  onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                  onClick={() => toggle(i)}
                >
                  <span className="ui-multiselect-checkbox" aria-hidden="true">
                    {checked && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className="ui-multiselect-option-label">{opt.label}</span>
                  {opt.count != null && (
                    <span className="ui-multiselect-option-count">{opt.count}</span>
                  )}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}

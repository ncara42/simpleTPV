import type { ReactElement, Ref } from 'react';
import { cloneElement, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Margen entre el borde derecho del trigger y la burbuja. */
const GAP_PX = 8;
/** Retardo de apertura: evita que el tooltip parpadee al barrer el menú con el ratón. */
const OPEN_DELAY_MS = 350;

interface TooltipPos {
  top: number;
  left: number;
}

export interface TooltipProps {
  /** Texto a mostrar. Solo la etiqueta, sin descripción. */
  label: string;
  /** Único trigger (se le inyecta ref, handlers de hover/focus y `aria-describedby`). */
  children: ReactElement<{
    ref?: Ref<HTMLElement>;
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
    'aria-describedby'?: string;
  }>;
  /** Desactiva el tooltip (p. ej. en modo rail, donde manda la burbuja CSS existente). */
  disabled?: boolean;
}

/**
 * Tooltip con la piel SimpleTPV (clase `.ui-tooltip`, definida en sidebar.css).
 * Se monta por PORTAL en `document.body` para escapar del `overflow: hidden` del
 * sidebar, que recortaría una burbuja CSS hacia la derecha en modo expandido.
 * Aparece a la derecha del trigger, centrado vertical, en hover o foco de teclado.
 */
export function Tooltip({ label, children, disabled = false }: TooltipProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const tooltipId = useId();

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearTimer();
    setPos(null);
  }, [clearTimer]);

  const computePos = useCallback((): TooltipPos | null => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { top: rect.top + rect.height / 2, left: rect.right + GAP_PX };
  }, []);

  const open = useCallback(() => {
    if (disabled) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      setPos(computePos());
    }, OPEN_DELAY_MS);
  }, [disabled, clearTimer, computePos]);

  // Limpiar el temporizador pendiente al desmontar.
  useEffect(() => clearTimer, [clearTimer]);

  // Mientras está abierto: Escape lo cierra; scroll/resize lo descuelgan, así que cerramos.
  useEffect(() => {
    if (pos === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos, close]);

  if (disabled) return children;

  const child = children;
  // `aria-describedby` solo se incluye cuando hay valor (exactOptionalPropertyTypes
  // prohíbe pasar `undefined` a una prop opcional).
  const describedBy = pos ? tooltipId : child.props['aria-describedby'];
  const trigger = cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      // Conservar el ref original del hijo si lo tuviera.
      const childRef = (child as { ref?: Ref<HTMLElement> }).ref;
      if (typeof childRef === 'function') childRef(node);
      else if (childRef && typeof childRef === 'object') {
        (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      child.props.onMouseEnter?.(e);
      open();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      child.props.onMouseLeave?.(e);
      close();
    },
    onFocus: (e: React.FocusEvent) => {
      child.props.onFocus?.(e);
      open();
    },
    onBlur: (e: React.FocusEvent) => {
      child.props.onBlur?.(e);
      close();
    },
    ...(describedBy !== undefined ? { 'aria-describedby': describedBy } : {}),
  });

  return (
    <>
      {trigger}
      {pos &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            className="ui-tooltip"
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}

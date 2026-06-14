import './day-picker.css';

import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ── Utilidades de fecha en hora LOCAL, sobre cadenas 'YYYY-MM-DD' (sin TZ shifts) ──
const pad = (n: number): string => String(n).padStart(2, '0');
const toIso = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};
const addDays = (iso: string, n: number): string => {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
};
const todayIso = (): string => toIso(new Date());

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const monthTitleFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const pillFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

// Etiqueta compacta de la pastilla: "Hoy"/"Ayer" o "14 jun".
function pillLabel(iso: string): string {
  const today = todayIso();
  if (iso === today) return 'Hoy';
  if (iso === addDays(today, -1)) return 'Ayer';
  return pillFmt.format(fromIso(iso)).replace('.', '');
}

// Matriz 6×7 (lunes primero) que cubre el mes de year/month0.
function monthMatrix(year: number, month0: number): Date[][] {
  const first = new Date(year, month0, 1);
  const startDow = (first.getDay() + 6) % 7; // 0 = lunes
  const cur = new Date(year, month0, 1 - startDow);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let d = 0; d < 7; d++) {
      row.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

/**
 * Selector de día propio (no nativo): flechas día anterior/siguiente + pastilla con la
 * fecha que abre un calendario diseñado de cero. No deja elegir días futuros (sin datos).
 */
export function DaySelector({
  value,
  onChange,
}: {
  value: string; // 'YYYY-MM-DD'
  onChange: (iso: string) => void;
}) {
  const today = todayIso();
  const [open, setOpen] = useState(false);
  // Mes visible del calendario (deriva del día seleccionado al abrir).
  const [view, setView] = useState(() => {
    const d = fromIso(value);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const canNext = value < today; // no avanzar al futuro

  // Al abrir, sincroniza el mes visible con el día seleccionado.
  const openCal = (): void => {
    const d = fromIso(value);
    setView({ y: d.getFullYear(), m: d.getMonth() });
    setOpen(true);
  };

  const pick = (iso: string): void => {
    onChange(iso);
    setOpen(false);
  };

  // Cerrar al clicar fuera o con Escape (el popover vive en un portal).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Posicionar el calendario bajo la pastilla, alineado a su derecha; recolocar en
  // scroll/resize. Se mantiene dentro del viewport por la izquierda.
  const updatePos = (): void => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 280;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    setPos({ left, top: rect.bottom + 6 });
  };
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
    const handler = (): void => updatePos();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open]);

  const weeks = monthMatrix(view.y, view.m);
  const title = monthTitleFmt.format(new Date(view.y, view.m, 1));

  return (
    <div className="day-sel" ref={rootRef}>
      <button
        type="button"
        className="day-sel-step"
        onClick={() => onChange(addDays(value, -1))}
        aria-label="Día anterior"
        data-testid="dash-hour-day-prev"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="day-sel-trigger"
        onClick={() => (open ? setOpen(false) : openCal())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Elegir día"
        data-testid="dash-hour-day"
      >
        <Calendar size={15} aria-hidden="true" />
        {pillLabel(value)}
      </button>

      <button
        type="button"
        className="day-sel-step"
        onClick={() => onChange(addDays(value, 1))}
        disabled={!canNext}
        aria-label="Día siguiente"
        data-testid="dash-hour-day-next"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            className="day-cal"
            ref={popRef}
            role="dialog"
            aria-label="Calendario"
            style={{ left: pos.left, top: pos.top }}
            data-testid="dash-hour-calendar"
          >
            <div className="day-cal-head">
              <button
                type="button"
                className="day-cal-nav"
                onClick={() =>
                  setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { ...v, m: v.m - 1 }))
                }
                aria-label="Mes anterior"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span className="day-cal-title">{title}</span>
              <button
                type="button"
                className="day-cal-nav"
                onClick={() =>
                  setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { ...v, m: v.m + 1 }))
                }
                aria-label="Mes siguiente"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="day-cal-grid">
              {DOW.map((d) => (
                <span key={d} className="day-cal-dow">
                  {d}
                </span>
              ))}
              {weeks.flat().map((d) => {
                const iso = toIso(d);
                const outside = d.getMonth() !== view.m;
                const future = iso > today;
                const cls = [
                  'day-cal-cell',
                  outside && 'is-outside',
                  iso === today && 'is-today',
                  iso === value && 'is-selected',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={iso}
                    type="button"
                    className={cls}
                    disabled={future}
                    onClick={() => pick(iso)}
                    aria-label={iso}
                    aria-pressed={iso === value}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="day-cal-foot">
              <button type="button" className="day-cal-today" onClick={() => pick(today)}>
                Hoy
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

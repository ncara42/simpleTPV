import { Gauge } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ContextProps {
  inputTokens: number;
  outputTokens: number;
  costEur: string;
  /** Ventana de contexto aproximada para el porcentaje (orientativo). */
  maxTokens?: number;
}

function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function fmtEur(value: string): string {
  const amount = Number(value);
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/**
 * Uso del contexto (tokens + coste), estilo Context de ai-elements: un trigger compacto con el
 * porcentaje y un popover con el desglose entrada/salida y el coste. Vive ARRIBA, en la cabecera del
 * asistente, y abre hacia abajo. El % es orientativo (no conocemos la ventana real del gateway).
 * `data-no-drag` evita que interactuar con él arrastre la ventana (la cabecera es el asa). Diseño con
 * tokens del sistema.
 */
export function Context({ inputTokens, outputTokens, costEur, maxTokens = 200000 }: ContextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const used = inputTokens + outputTokens;
  const pct = Math.min(100, Math.round((used / maxTokens) * 100));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div className="ctx" ref={ref} data-no-drag>
      <button
        type="button"
        className="ctx__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Uso del contexto"
        title="Uso del contexto"
      >
        <Gauge size={13} aria-hidden="true" />
        <span>{pct}%</span>
      </button>

      {open && (
        <div className="ctx__panel" role="dialog" aria-label="Uso del contexto">
          <div className="ctx__head">
            <span>{fmtTokens(used)} tokens</span>
            <span>{pct}%</span>
          </div>
          <div className="ctx__row">
            <span>Entrada</span>
            <span>{fmtTokens(inputTokens)}</span>
          </div>
          <div className="ctx__row">
            <span>Salida</span>
            <span>{fmtTokens(outputTokens)}</span>
          </div>
          <div className="ctx__foot">
            <span>Coste</span>
            <span>{fmtEur(costEur)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

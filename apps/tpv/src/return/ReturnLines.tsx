import type { Sale } from '@simpletpv/auth';

// Lista de líneas de una venta con stepper de cantidad a devolver. Presentacional:
// el estado (qtys, ya devuelto) vive en ReturnPanel; aquí solo se pinta y se
// notifican los cambios de cantidad vía onSetQty (que ya capa al máximo disponible).
export function ReturnLines({
  lines,
  qtys,
  returned,
  onSetQty,
}: {
  lines: Sale['lines'];
  qtys: Record<string, number>;
  returned: Map<string, number>;
  onSetQty: (saleLineId: string, qty: number, max: number) => void;
}) {
  return (
    <ul
      className="divide-y divide-[var(--ui-border)] rounded-lg border border-[var(--ui-border)] bg-white"
      data-testid="return-lines"
    >
      {lines.map((l) => {
        const alreadyReturned = returned.get(l.id) ?? 0;
        const max = Math.max(0, Number(l.qty) - alreadyReturned);
        return (
          <li key={l.id} className="flex items-center gap-3 px-4 py-3" data-testid="return-line">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-900">{l.name}</p>
              <p className="text-xs text-neutral-400">
                Vendido: {Number(l.qty)} · Devuelto: {alreadyReturned} · Disponible: {max}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => onSetQty(l.id, (qtys[l.id] ?? 0) - 1, max)}
                disabled={max === 0 || (qtys[l.id] ?? 0) === 0}
                aria-label="Quitar uno"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--ui-border)] text-sm text-neutral-500 hover:bg-neutral-50 disabled:opacity-30"
              >
                −
              </button>
              <span
                className="w-6 text-center text-sm font-semibold tabular-nums"
                data-testid="return-line-qty"
              >
                {qtys[l.id] ?? 0}
              </span>
              <button
                onClick={() => onSetQty(l.id, (qtys[l.id] ?? 0) + 1, max)}
                disabled={max === 0 || (qtys[l.id] ?? 0) >= max}
                aria-label="Añadir uno"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--ui-border)] text-sm text-neutral-500 hover:bg-neutral-50 disabled:opacity-30"
              >
                +
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

import { useQuery } from '@tanstack/react-query';

import { listClosedCashSessions } from '../lib/cash.js';
import { eur } from '../lib/format.js';

// Fecha legible (dd/mm/aaaa hh:mm) en hora local para el listado de cierres.
const dateFmt = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// Registro de cierres de caja de la tienda activa (#145): cada arqueo con su
// esperado, contado y diferencia (sobrante/faltante). Solo lectura.
export function CashClosuresList({ storeId }: { storeId: string | null }) {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['cash-closed', storeId],
    queryFn: () => listClosedCashSessions(storeId as string),
    enabled: storeId !== null,
  });

  if (storeId === null) {
    return null;
  }

  return (
    <section className="cash-closures" data-testid="cash-closures">
      <h3 className="cash-closures-title">Cierres recientes</h3>
      {isLoading ? (
        <p className="cash-closures-empty">Cargando…</p>
      ) : sessions.length === 0 ? (
        <p className="cash-closures-empty" data-testid="cash-closures-empty">
          Aún no hay cierres registrados.
        </p>
      ) : (
        <ul className="cash-closures-list">
          {sessions.map((s) => {
            const diff = Number(s.difference ?? 0);
            const tone = diff === 0 ? 'ok' : diff > 0 ? 'over' : 'under';
            return (
              <li key={s.id} className="cash-closure-row" data-testid="cash-closure-row">
                <span className="cash-closure-date">
                  {s.closedAt ? dateFmt.format(new Date(s.closedAt)) : '—'}
                </span>
                <span className="cash-closure-amounts">
                  <span>Esperado {eur(Number(s.expectedAmount ?? 0))} €</span>
                  <span>Contado {eur(Number(s.closingAmount ?? 0))} €</span>
                </span>
                <span className={`cash-closure-diff diff-${tone}`} data-testid="cash-closure-diff">
                  {diff > 0 ? '+' : ''}
                  {eur(diff)} €
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

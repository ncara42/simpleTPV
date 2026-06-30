import { DataTable } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';

import { type CashSession, listClosedCashSessions } from '../lib/cash.js';
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
// esperado, contado y diferencia (sobrante/faltante). Solo lectura, sobre el
// DataTable compartido para mantener el estilo de tabla del resto de la app.
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
      <DataTable<CashSession>
        rows={sessions}
        rowKey={(s) => s.id}
        rowTestId="cash-closure-row"
        loading={isLoading}
        skeletonRows={3}
        emptyState={<span data-testid="cash-closures-empty">Aún no hay cierres registrados.</span>}
        columns={[
          {
            key: 'date',
            header: 'Fecha',
            render: (s) => (s.closedAt ? dateFmt.format(new Date(s.closedAt)) : '—'),
          },
          {
            key: 'expected',
            header: 'Esperado',
            align: 'right',
            noWrap: true,
            render: (s) => `${eur(Number(s.expectedAmount ?? 0))} €`,
          },
          {
            key: 'counted',
            header: 'Contado',
            align: 'right',
            noWrap: true,
            render: (s) => `${eur(Number(s.closingAmount ?? 0))} €`,
          },
          {
            key: 'diff',
            header: 'Diferencia',
            align: 'right',
            noWrap: true,
            render: (s) => {
              const diff = Number(s.difference ?? 0);
              const tone = diff === 0 ? 'ok' : diff > 0 ? 'over' : 'under';
              return (
                <span className={`cash-closure-diff diff-${tone}`} data-testid="cash-closure-diff">
                  {diff > 0 ? '+' : ''}
                  {eur(diff)} €
                </span>
              );
            },
          },
        ]}
      />
    </section>
  );
}

import { Leaderboard, ShareBar, Treemap } from '@simpletpv/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { getProductRankings, getSalesByFamily } from '../../lib/dashboard.js';
import { PanelShell } from './PanelShell.js';
import type { PanelProps } from './types.js';

// Sección 03 · Reparto de facturación por familia (ShareBar): riel segmentado + leyenda con cuotas.
// Comparte el `queryKey` 'dash-family' con el resto de widgets de familia → caché compartida.
export function FamilyShare({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-family', period, store],
    queryFn: () => getSalesByFamily(period, store),
    placeholderData: keepPreviousData,
  });
  const items = (q.data ?? []).map((f) => ({ label: f.familyName, value: f.total }));

  return (
    <PanelShell id="lista-familia" fill>
      <ShareBar items={items} isLoading={q.isLoading} isError={q.isError} />
    </PanelShell>
  );
}

// Sección 03 · Ranking de productos más vendidos (Leaderboard): tarjeta por puesto con cifra,
// pista de unidades y barra proporcional; el nº1 con chip azul.
export function ProductRanking({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-rankings', period, store],
    queryFn: () => getProductRankings(period, store),
    placeholderData: keepPreviousData,
  });
  const items = (q.data?.topSales ?? []).map((p) => ({
    label: p.name,
    value: p.total,
    detail: `${p.units} uds`,
  }));

  return (
    <PanelShell id="lista-rankings" fill>
      <Leaderboard items={items} format="eur" isLoading={q.isLoading} isError={q.isError} />
    </PanelShell>
  );
}

// Sección 03 · Mix por familia como mapa de área (Treemap): área ∝ facturación, rampa azul descendente.
// Tratamiento alternativo del mismo reparto que `lista-familia` (cada alternativa = widget propio).
export function FamilyTreemap({ period, store }: PanelProps): ReactElement {
  const q = useQuery({
    queryKey: ['dash-family', period, store],
    queryFn: () => getSalesByFamily(period, store),
    placeholderData: keepPreviousData,
  });
  const items = (q.data ?? []).map((f) => ({ label: f.familyName, value: f.total }));

  return (
    <PanelShell id="lista-mix" fill>
      <Treemap items={items} format="eur" isLoading={q.isLoading} isError={q.isError} />
    </PanelShell>
  );
}

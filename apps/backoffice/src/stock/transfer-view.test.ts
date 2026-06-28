import type { Transfer, TransferLine } from '@simpletpv/auth';
import { describe, expect, it } from 'vitest';

import {
  applyStoreFacets,
  applyView,
  buildFullReceiveInput,
  buildRow,
  buildTransferDetail,
  computeStoreFacets,
  computeViewCounts,
  fmtDateTime,
  fmtShortDate,
  groupTransfers,
  hasIncidence,
  primaryAction,
  searchTransfers,
  sortTransfers,
  statusKey,
  transferLabel,
  transferRef,
  transferRoute,
  unitsSent,
} from './transfer-view.js';

const STORE_NAMES: Record<string, string> = {
  cen: 'Centro',
  nor: 'Norte',
  sur: 'Sur',
  alm: 'Almacén',
};
const nameOf = (id: string): string => STORE_NAMES[id] ?? id;
const resolveProduct = (pid: string): { name: string; sku: string } => ({
  name: `Producto ${pid}`,
  sku: `SKU-${pid}`,
});

function line(over: Partial<TransferLine>): TransferLine {
  return {
    id: 'l1',
    transferId: 't1',
    productId: 'p1',
    quantitySent: '10',
    quantityReceived: null,
    discrepancy: null,
    discrepancyNote: null,
    ...over,
  } as TransferLine;
}

function makeTransfer(over: Partial<Transfer>): Transfer {
  return {
    id: 't1',
    originStoreId: 'cen',
    destStoreId: 'nor',
    status: 'DRAFT',
    notes: null,
    createdBy: 'u1',
    createdAt: '2026-06-20T09:10:00.000Z',
    sentAt: null,
    receivedAt: null,
    closedAt: null,
    lines: [line({})],
    ...over,
  } as Transfer;
}

describe('transfer-view · cantidades y estado', () => {
  it('suma unidades enviadas coercionando los string del modelo', () => {
    const t = makeTransfer({
      lines: [line({ quantitySent: '12' }), line({ id: 'l2', quantitySent: '8' })],
    });
    expect(unitsSent(t)).toBe(20);
  });

  it('deriva la clave de estado del ciclo crudo', () => {
    expect(statusKey(makeTransfer({ status: 'DRAFT' }))).toBe('draft');
    expect(statusKey(makeTransfer({ status: 'SENT' }))).toBe('sent');
    expect(statusKey(makeTransfer({ status: 'CLOSED' }))).toBe('closed');
  });

  it('marca incidencia cuando una línea recibida queda por debajo de lo enviado', () => {
    const ok = makeTransfer({
      status: 'RECEIVED',
      lines: [line({ quantitySent: '10', quantityReceived: '10' })],
    });
    const short = makeTransfer({
      status: 'RECEIVED',
      lines: [line({ quantitySent: '10', quantityReceived: '7' })],
    });
    expect(hasIncidence(ok)).toBe(false);
    expect(hasIncidence(short)).toBe(true);
    expect(statusKey(ok)).toBe('received');
    expect(statusKey(short)).toBe('incid');
  });
});

describe('transfer-view · nombre y ruta', () => {
  it('usa notes si existe y cae al auto-nombre "Origen → Destino"', () => {
    expect(transferLabel(makeTransfer({ notes: 'Reposición' }), nameOf)).toBe('Reposición');
    expect(transferLabel(makeTransfer({ notes: null }), nameOf)).toBe('Centro → Norte');
    expect(transferRoute(makeTransfer({}), nameOf)).toBe('Centro → Norte');
  });
});

describe('transfer-view · filtrado, vistas y facetas', () => {
  const list = [
    makeTransfer({
      id: 't1',
      notes: 'Pedido semanal',
      originStoreId: 'cen',
      destStoreId: 'nor',
      status: 'DRAFT',
    }),
    makeTransfer({
      id: 't2',
      notes: 'Devoluciones',
      originStoreId: 'sur',
      destStoreId: 'alm',
      status: 'SENT',
    }),
    makeTransfer({
      id: 't3',
      notes: null,
      originStoreId: 'cen',
      destStoreId: 'sur',
      status: 'RECEIVED',
      lines: [line({ quantitySent: '10', quantityReceived: '4' })],
    }),
  ];

  it('busca por nombre y por nombre de tienda', () => {
    expect(searchTransfers(list, 'semanal', nameOf).map((t) => t.id)).toEqual(['t1']);
    expect(searchTransfers(list, 'almacén', nameOf).map((t) => t.id)).toEqual(['t2']);
    expect(searchTransfers(list, '', nameOf)).toHaveLength(3);
  });

  it('filtra por vista (incluida la vista de incidencias)', () => {
    expect(applyView(list, 'draft').map((t) => t.id)).toEqual(['t1']);
    expect(applyView(list, 'incid').map((t) => t.id)).toEqual(['t3']);
    expect(applyView(list, 'all')).toHaveLength(3);
  });

  it('cuenta cada vista sobre el conjunto buscado', () => {
    const counts = computeViewCounts(list);
    expect(counts.all).toBe(3);
    expect(counts.draft).toBe(1);
    expect(counts.sent).toBe(1);
    expect(counts.incid).toBe(1);
    expect(counts.closed).toBe(0);
  });

  it('filtra por facetas de origen y destino (vacío = todas)', () => {
    expect(applyStoreFacets(list, new Set(['cen']), new Set()).map((t) => t.id)).toEqual([
      't1',
      't3',
    ]);
    expect(applyStoreFacets(list, new Set(), new Set(['alm'])).map((t) => t.id)).toEqual(['t2']);
    expect(applyStoreFacets(list, new Set(), new Set())).toHaveLength(3);
  });

  it('computa facetas de tienda solo con las que tienen traspasos, en orden', () => {
    const origins = computeStoreFacets(list, 'origin', ['cen', 'nor', 'sur', 'alm'], nameOf);
    expect(origins).toEqual([
      { id: 'cen', label: 'Centro', count: 2 },
      { id: 'sur', label: 'Sur', count: 1 },
    ]);
  });
});

describe('transfer-view · orden y agrupación', () => {
  const list = [
    makeTransfer({ id: 'old', createdAt: '2026-06-01T00:00:00.000Z', status: 'DRAFT' }),
    makeTransfer({ id: 'new', createdAt: '2026-06-10T00:00:00.000Z', status: 'DRAFT' }),
  ];

  it('ordena por fecha de creación', () => {
    expect(sortTransfers(list, true).map((t) => t.id)).toEqual(['new', 'old']);
    expect(sortTransfers(list, false).map((t) => t.id)).toEqual(['old', 'new']);
  });

  it('agrupa por estado en orden de ciclo, omite grupos vacíos y suma unidades', () => {
    const groups = groupTransfers([
      makeTransfer({ id: 'a', status: 'DRAFT', lines: [line({ quantitySent: '5' })] }),
      makeTransfer({ id: 'b', status: 'DRAFT', lines: [line({ quantitySent: '7' })] }),
      makeTransfer({
        id: 'c',
        status: 'RECEIVED',
        lines: [line({ quantitySent: '3', quantityReceived: '3' })],
      }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['DRAFT', 'RECEIVED']);
    expect(groups[0]).toMatchObject({
      label: 'Borradores',
      count: 2,
      unitsLabel: '12 uds',
      tone: 'draft',
    });
    expect(groups[1]).toMatchObject({ label: 'Recibidos', count: 1, unitsLabel: '3 uds' });
  });
});

describe('transfer-view · acciones reales por estado', () => {
  it('mapea cada estado a su única acción real (o ninguna en cerrado)', () => {
    expect(primaryAction(makeTransfer({ status: 'DRAFT' }))).toMatchObject({
      kind: 'send',
      label: 'Enviar',
    });
    expect(primaryAction(makeTransfer({ status: 'SENT' }))).toMatchObject({
      kind: 'receive',
      label: 'Recibir',
    });
    expect(primaryAction(makeTransfer({ status: 'RECEIVED' }))).toMatchObject({
      kind: 'close',
      label: 'Cerrar',
    });
    expect(primaryAction(makeTransfer({ status: 'CLOSED' }))).toBeNull();
  });

  it('construye la recepción en bloque (todo lo enviado, sin discrepancia)', () => {
    const t = makeTransfer({
      status: 'SENT',
      lines: [line({ id: 'l1', quantitySent: '6' }), line({ id: 'l2', quantitySent: '4' })],
    });
    expect(buildFullReceiveInput(t)).toEqual({
      lines: [
        { lineId: 'l1', quantityReceived: 6 },
        { lineId: 'l2', quantityReceived: 4 },
      ],
    });
  });
});

describe('transfer-view · fila y ficha', () => {
  it('arma la fila de tabla (ref + nota + ruta, sin sufijo de uds)', () => {
    const row = buildRow(
      makeTransfer({
        id: 't1',
        notes: 'Pedido',
        status: 'DRAFT',
        lines: [line({ quantitySent: '5' }), line({ id: 'l2', quantitySent: '3' })],
      }),
      nameOf,
    );
    expect(row).toMatchObject({
      ref: 'TR-T1',
      note: 'Pedido',
      hasNote: true,
      route: 'Centro → Norte',
      linesLabel: '2',
      unitsLabel: '8',
      badgeTone: 'neutral',
    });
  });

  it('fila recibida con falta: ratio recibido/enviado y tono de incidencia', () => {
    const row = buildRow(
      makeTransfer({
        status: 'RECEIVED',
        lines: [line({ quantitySent: '10', quantityReceived: '7' })],
      }),
      nameOf,
    );
    expect(row.unitsLabel).toBe('7 / 10');
    expect(row.badgeTone).toBe('incid');
    expect(row.incident).toBe(true);
  });

  it('deriva una referencia corta y estable del id', () => {
    expect(transferRef('9fb24962-1a2b-3c4d')).toBe('TR-9FB249');
    expect(transferRef('t1')).toBe('TR-T1');
  });

  it('arma la ficha con líneas recibidas/enviadas y nota de incidencia', () => {
    const t = makeTransfer({
      id: 't9',
      notes: null,
      status: 'RECEIVED',
      sentAt: '2026-06-20T18:40:00.000Z',
      receivedAt: '2026-06-21T11:05:00.000Z',
      lines: [
        line({ id: 'l1', productId: 'p1', quantitySent: '10', quantityReceived: '7' }),
        line({ id: 'l2', productId: 'p2', quantitySent: '5', quantityReceived: '5' }),
      ],
    });
    const detail = buildTransferDetail(t, nameOf, resolveProduct);
    expect(detail.primary).toBe('Centro → Norte');
    expect(detail.statusKey).toBe('incid');
    expect(detail.avatarText).toBe('CEN');
    expect(detail.hasIncidence).toBe(true);
    expect(detail.incidenceNote).toContain('faltan 3');
    expect(detail.lines[0]).toMatchObject({
      name: 'Producto p1',
      sku: 'SKU-p1',
      right: '7 / 10',
      short: true,
    });
    expect(detail.lines[1]).toMatchObject({ right: '5 / 5', short: false });
    expect(detail.lineTotalLabel).toBe('Recibidas / enviadas');
    // Línea de tiempo: creado → enviado → recibido con incidencia → pendiente de cierre.
    expect(detail.timeline.map((s) => s.tone)).toEqual(['done', 'done', 'incid', 'pending']);
  });

  it('ficha de borrador: líneas como enviadas y timeline corto', () => {
    const detail = buildTransferDetail(makeTransfer({ status: 'DRAFT' }), nameOf, resolveProduct);
    expect(detail.lines[0].right).toBe('10 uds');
    expect(detail.lineTotalLabel).toBe('Unidades enviadas');
    expect(detail.timeline.map((s) => s.label)).toEqual(['Traspaso creado', 'Pendiente de envío']);
    expect(detail.action).toMatchObject({ kind: 'send' });
  });
});

describe('transfer-view · formato de fecha (UTC, determinista)', () => {
  it('formatea fecha corta y fecha-hora', () => {
    expect(fmtShortDate('2026-06-20T09:10:00.000Z')).toBe('20 jun');
    expect(fmtDateTime('2026-06-20T18:40:00.000Z')).toBe('20 jun · 18:40');
  });
});

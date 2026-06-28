/**
 * Lógica pura de la vista Traspasos v2 (tabla agrupada + ficha lateral).
 *
 * Módulo sin React, testeable de forma aislada. Deriva del modelo real `Transfer`
 * (cantidades en `string`, ciclo DRAFT→SENT→RECEIVED→CLOSED) todo lo que pinta la
 * tabla y el cajón de detalle: estado mostrado, agrupación, recuentos de vistas y
 * facetas, filtrado/orden, línea de tiempo del traspaso y la acción real disponible
 * en cada estado. Las acciones solo mapean a endpoints reales (enviar/recibir/cerrar);
 * no hay acciones de maqueta (editar/duplicar/eliminar).
 */
import type { ReceiveTransferInput, Transfer, TransferLine } from '@simpletpv/auth';

import { transferDisplayName } from './transfer-name.js';

/** Resuelve el nombre de una tienda por id (cae al propio id si no se conoce). */
export type StoreNameResolver = (id: string) => string;
/** Resuelve nombre + SKU de un producto por id, para las líneas de la ficha. */
export type ProductResolver = (productId: string) => { name: string; sku: string };

export type RawStatus = 'DRAFT' | 'SENT' | 'RECEIVED' | 'CLOSED';
/** Estado mostrado: el crudo + `incid` (recibido con faltas) como matiz visual. */
export type TransferStatusKey = 'draft' | 'sent' | 'received' | 'closed' | 'incid';

/** Tono visual de estado (sufijo de clase CSS `tr-badge--*` / `tr-dot--*`). */
export type StatusTone = 'draft' | 'sent' | 'received' | 'closed' | 'incid';

export interface StatusMeta {
  key: TransferStatusKey;
  /** Etiqueta de píldora/ficha: Borrador, En tránsito, Recibido, Cerrado, Incidencia. */
  label: string;
  tone: StatusTone;
  /** Glifo del icono de estado en la ficha. */
  glyph: string;
}

const STATUS_META: Record<TransferStatusKey, StatusMeta> = {
  draft: { key: 'draft', label: 'Borrador', tone: 'draft', glyph: '•' },
  sent: { key: 'sent', label: 'En tránsito', tone: 'sent', glyph: '•' },
  received: { key: 'received', label: 'Recibido', tone: 'received', glyph: '✓' },
  closed: { key: 'closed', label: 'Cerrado', tone: 'closed', glyph: '✓' },
  incid: { key: 'incid', label: 'Incidencia', tone: 'incid', glyph: '!' },
};

/** Vistas guardadas (filtros de estado del carril). */
export type TransferView = 'all' | 'draft' | 'sent' | 'received' | 'closed' | 'incid';
export const TRANSFER_VIEWS: TransferView[] = [
  'all',
  'draft',
  'sent',
  'received',
  'closed',
  'incid',
];
export const VIEW_LABELS: Record<TransferView, string> = {
  all: 'Todos',
  draft: 'Borradores',
  sent: 'En tránsito',
  received: 'Recibidos',
  closed: 'Cerrados',
  incid: 'Con incidencia',
};

interface GroupDef {
  status: RawStatus;
  label: string;
  tone: StatusTone;
}
// Orden de los grupos de la tabla (cabecera plegable por estado crudo).
const GROUP_DEFS: GroupDef[] = [
  { status: 'DRAFT', label: 'Borradores', tone: 'draft' },
  { status: 'SENT', label: 'En tránsito', tone: 'sent' },
  { status: 'RECEIVED', label: 'Recibidos', tone: 'received' },
  { status: 'CLOSED', label: 'Cerrados', tone: 'closed' },
];

export interface TransferFilters {
  search: string;
  view: TransferView;
  /** ids de tienda de origen seleccionados (vacío = todos). */
  origins: ReadonlySet<string>;
  /** ids de tienda de destino seleccionados (vacío = todos). */
  dests: ReadonlySet<string>;
}
export const EMPTY_TRANSFER_FILTERS: TransferFilters = {
  search: '',
  view: 'all',
  origins: new Set(),
  dests: new Set(),
};

// ─── Cantidades (el modelo serializa numéricos como string) ───────────────────
export function lineSent(line: TransferLine): number {
  return Number(line.quantitySent) || 0;
}
export function lineReceived(line: TransferLine): number | null {
  return line.quantityReceived == null ? null : Number(line.quantityReceived) || 0;
}
export function unitsSent(t: Transfer): number {
  return t.lines.reduce((n, l) => n + lineSent(l), 0);
}
export function unitsReceived(t: Transfer): number {
  return t.lines.reduce((n, l) => n + (lineReceived(l) ?? 0), 0);
}
/** ¿Alguna línea recibida por debajo de lo enviado? (falta de stock al recibir). */
export function hasIncidence(t: Transfer): boolean {
  return t.lines.some((l) => {
    const r = lineReceived(l);
    return r != null && r < lineSent(l);
  });
}
/** ¿Incidencia visible en la revisión? Recibido/cerrado con faltante o comentario del
 *  empleado. Es la condición que tiñe la fila en rojo y enrojece el badge de unidades. */
export function hasReviewIncidence(t: Transfer): boolean {
  const showRecv = t.status === 'RECEIVED' || t.status === 'CLOSED';
  if (!showRecv) return false;
  return t.lines.some((l) => {
    const r = lineReceived(l);
    const short = r != null && r < lineSent(l);
    const note = (l.discrepancyNote ?? '').trim() !== '';
    return short || note;
  });
}
/** Incidencia ABIERTA: hubo incidencia y aún no se ha marcado como solucionada. Es lo
 *  que tiñe la fila de rojo y enrojece el badge; al resolverla deja de estar abierta. */
export function isIncidentOpen(t: Transfer): boolean {
  return hasReviewIncidence(t) && t.incidentResolvedAt == null;
}

// ─── Estado mostrado ──────────────────────────────────────────────────────────
const RAW_TO_KEY: Record<RawStatus, TransferStatusKey> = {
  DRAFT: 'draft',
  SENT: 'sent',
  RECEIVED: 'received',
  CLOSED: 'closed',
};
export function statusKey(t: Transfer): TransferStatusKey {
  // Solo cuenta como incidencia mientras esté ABIERTA; al resolverla vuelve a su estado.
  if (t.status === 'RECEIVED' && isIncidentOpen(t)) return 'incid';
  return RAW_TO_KEY[t.status];
}
export function statusMeta(t: Transfer): StatusMeta {
  return STATUS_META[statusKey(t)];
}

// ─── Nombre y ruta ────────────────────────────────────────────────────────────
export function transferRoute(t: Transfer, nameOf: StoreNameResolver): string {
  return `${nameOf(t.originStoreId)} → ${nameOf(t.destStoreId)}`;
}
/** Nombre mostrado: `notes` si existe, o el auto-nombre "Origen → Destino" (P105). */
export function transferLabel(t: Transfer, nameOf: StoreNameResolver): string {
  return transferDisplayName(t.notes, nameOf(t.originStoreId), nameOf(t.destStoreId));
}
/** Nota libre del traspaso (el nombre escrito por el usuario), o '' si no tiene. */
export function transferNote(t: Transfer): string {
  return (t.notes ?? '').trim();
}
/**
 * Referencia corta y estable derivada del id, p. ej. `TR-9FB249`. El backend no
 * guarda un número correlativo, así que se compone de forma determinista a partir
 * del id (uuid sin guiones, primeros 6 alfanuméricos en mayúscula) — único y estable
 * por traspaso, sirve como identificador legible en la tabla y la ficha.
 */
export function transferRef(id: string): string {
  const alnum = id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `TR-${alnum.slice(0, 6) || '—'}`;
}

// ─── Filtrado, orden y agrupación ─────────────────────────────────────────────
export function matchesSearch(t: Transfer, term: string, nameOf: StoreNameResolver): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return [transferLabel(t, nameOf), nameOf(t.originStoreId), nameOf(t.destStoreId)]
    .join(' ')
    .toLowerCase()
    .includes(q);
}
export function searchTransfers(
  list: Transfer[],
  term: string,
  nameOf: StoreNameResolver,
): Transfer[] {
  const q = term.trim().toLowerCase();
  return q ? list.filter((t) => matchesSearch(t, q, nameOf)) : list;
}

function viewPredicate(view: TransferView): (t: Transfer) => boolean {
  switch (view) {
    case 'draft':
      return (t) => t.status === 'DRAFT';
    case 'sent':
      return (t) => t.status === 'SENT';
    case 'received':
      return (t) => t.status === 'RECEIVED';
    case 'closed':
      return (t) => t.status === 'CLOSED';
    case 'incid':
      // Solo incidencias ABIERTAS; las resueltas salen del filtro y quedan en su estado.
      return (t) => isIncidentOpen(t);
    default:
      return () => true;
  }
}
export function applyView(list: Transfer[], view: TransferView): Transfer[] {
  return list.filter(viewPredicate(view));
}
export function applyStoreFacets(
  list: Transfer[],
  origins: ReadonlySet<string>,
  dests: ReadonlySet<string>,
): Transfer[] {
  return list
    .filter((t) => origins.size === 0 || origins.has(t.originStoreId))
    .filter((t) => dests.size === 0 || dests.has(t.destStoreId));
}
/** Orden por fecha de creación (descendente = más recientes primero por defecto). */
export function sortTransfers(list: Transfer[], desc: boolean): Transfer[] {
  return list.slice().sort((a, b) => {
    const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return desc ? -d : d;
  });
}

export interface TransferGroup {
  key: RawStatus;
  label: string;
  tone: StatusTone;
  count: number;
  /** Total de unidades enviadas del grupo, p. ej. "120 uds". */
  unitsLabel: string;
  rows: Transfer[];
}
export function groupTransfers(sorted: Transfer[]): TransferGroup[] {
  return GROUP_DEFS.map((g) => {
    const rows = sorted.filter((t) => t.status === g.status);
    if (rows.length === 0) return null;
    const total = rows.reduce((n, t) => n + unitsSent(t), 0);
    return {
      key: g.status,
      label: g.label,
      tone: g.tone,
      count: rows.length,
      unitsLabel: `${total} uds`,
      rows,
    } satisfies TransferGroup;
  }).filter((g): g is TransferGroup => g !== null);
}

// ─── Recuentos de vistas y facetas ────────────────────────────────────────────
export function computeViewCounts(afterSearch: Transfer[]): Record<TransferView, number> {
  const counts = {} as Record<TransferView, number>;
  for (const view of TRANSFER_VIEWS) counts[view] = afterSearch.filter(viewPredicate(view)).length;
  return counts;
}

export interface StoreFacet {
  id: string;
  label: string;
  count: number;
}
/**
 * Facetas de tienda (origen o destino) sobre el conjunto ya filtrado por vista,
 * en el orden de `storeIds` y solo las que tienen al menos un traspaso.
 */
export function computeStoreFacets(
  afterView: Transfer[],
  field: 'origin' | 'dest',
  storeIds: string[],
  nameOf: StoreNameResolver,
): StoreFacet[] {
  const key = field === 'origin' ? 'originStoreId' : 'destStoreId';
  return storeIds
    .map((id) => ({ id, label: nameOf(id), count: afterView.filter((t) => t[key] === id).length }))
    .filter((f) => f.count > 0);
}

// ─── Acción real disponible por estado (enviar/recibir/cerrar) ────────────────
export type TransferActionKind = 'send' | 'receive' | 'close';
export interface TransferAction {
  kind: TransferActionKind;
  label: string;
  /** Énfasis visual del botón en línea. */
  tone: 'primary';
}
export function primaryAction(t: Transfer): TransferAction | null {
  switch (t.status) {
    case 'DRAFT':
      return { kind: 'send', label: 'Enviar', tone: 'primary' };
    case 'SENT':
      return { kind: 'receive', label: 'Recibir', tone: 'primary' };
    case 'RECEIVED':
      return { kind: 'close', label: 'Cerrar', tone: 'primary' };
    default:
      return null;
  }
}
/** Recepción en bloque (todo lo enviado), sin discrepancia: para la acción rápida. */
export function buildFullReceiveInput(t: Transfer): ReceiveTransferInput {
  return { lines: t.lines.map((l) => ({ lineId: l.id, quantityReceived: lineSent(l) })) };
}

// ─── Formato de fecha compacto (UTC, determinista) ────────────────────────────
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${fmtShortDate(iso)} · ${hh}:${mm}`;
}

// ─── Filas de la tabla ────────────────────────────────────────────────────────
/** Tono de la píldora de unidades: el color solo aparece cuando importa. */
export type UnitsBadgeTone = 'neutral' | 'received' | 'incid';
export function unitsBadgeTone(t: Transfer): UnitsBadgeTone {
  if (isIncidentOpen(t)) return 'incid';
  if (t.status === 'RECEIVED') return 'received';
  return 'neutral';
}

export interface TransferRowVM {
  id: string;
  /** Referencia corta (TR-XXXXXX), identificador principal de la fila. */
  ref: string;
  /** Nota/nombre del usuario (subtítulo), '' si no tiene. */
  note: string;
  hasNote: boolean;
  route: string;
  linesLabel: string;
  createdLabel: string;
  /** "recibidas / enviadas" cuando ya se recibió/cerró; si no, solo enviadas. */
  unitsLabel: string;
  badgeTone: UnitsBadgeTone;
  /** Incidencia en la recepción → la fila se tiñe de rojo. */
  incident: boolean;
}
export function buildRow(t: Transfer, nameOf: StoreNameResolver): TransferRowVM {
  const note = transferNote(t);
  const sent = unitsSent(t);
  const showRecv = t.status === 'RECEIVED' || t.status === 'CLOSED';
  return {
    id: t.id,
    ref: transferRef(t.id),
    note,
    hasNote: note !== '',
    route: transferRoute(t, nameOf),
    linesLabel: String(t.lines.length),
    createdLabel: fmtShortDate(t.createdAt),
    unitsLabel: showRecv ? `${unitsReceived(t)} / ${sent}` : `${sent}`,
    badgeTone: unitsBadgeTone(t),
    incident: isIncidentOpen(t),
  };
}

// ─── Ficha lateral (cajón) ────────────────────────────────────────────────────
export interface DrawerMetaItem {
  label: string;
  value: string;
}
export interface DrawerLine {
  id: string;
  name: string;
  sku: string;
  right: string;
  /** Recibido por debajo de lo enviado → resaltar en rojo. */
  short: boolean;
}
/** Revisión de recepción: incidencia por línea (faltante y/o comentario del empleado). */
export interface ReviewIncident {
  product: string;
  note: string | null;
  /** "5 / 6" cuando hay recepción; resaltado si falta stock. */
  qtyLabel: string;
  short: boolean;
}
/** Estado del cuadro de revisión: sin recibir · todo perfecto · con incidencias ·
 *  incidencia solucionada (hubo incidencia pero ya se resolvió desde el chat). */
export type ReviewState = 'pending' | 'perfect' | 'incidents' | 'resolved';

export type TimelineTone = 'done' | 'ok' | 'transit' | 'incid' | 'pending';
export interface TimelineStep {
  tone: TimelineTone;
  glyph: string;
  label: string;
  when: string;
  /** Dibuja la línea conectora hacia el siguiente paso. */
  line: boolean;
}
export interface TransferDetail {
  id: string;
  primary: string;
  routeLine: string;
  avatarText: string;
  statusKey: TransferStatusKey;
  statusLabel: string;
  tone: StatusTone;
  glyph: string;
  meta: DrawerMetaItem[];
  lines: DrawerLine[];
  lineTotalLabel: string;
  unitsLabel: string;
  hasIncidence: boolean;
  incidenceNote: string;
  /** Cuadro «Revisión de recepción»: estado + incidencias/comentarios por línea. */
  reviewState: ReviewState;
  incidents: ReviewIncident[];
  timeline: TimelineStep[];
  action: TransferAction | null;
}

export function buildTimeline(t: Transfer): TimelineStep[] {
  const sk = statusKey(t);
  const steps: TimelineStep[] = [
    {
      tone: 'done',
      glyph: '✓',
      label: 'Traspaso creado',
      when: fmtDateTime(t.createdAt),
      line: true,
    },
  ];
  if (sk === 'draft') {
    steps.push({
      tone: 'pending',
      glyph: '•',
      label: 'Pendiente de envío',
      when: 'Sin enviar',
      line: false,
    });
    return steps;
  }
  steps.push({
    tone: 'done',
    glyph: '✓',
    label: 'Enviado',
    when: t.sentAt ? fmtDateTime(t.sentAt) : '—',
    line: true,
  });
  if (sk === 'sent') {
    steps.push({
      tone: 'transit',
      glyph: '•',
      label: 'En tránsito · pendiente de recepción',
      when: 'En camino',
      line: false,
    });
    return steps;
  }
  const receivedWhen = t.receivedAt ? fmtDateTime(t.receivedAt) : '—';
  if (sk === 'incid') {
    steps.push({
      tone: 'incid',
      glyph: '!',
      label: 'Recibido con incidencia',
      when: receivedWhen,
      line: true,
    });
  } else {
    steps.push({ tone: 'ok', glyph: '✓', label: 'Recibido', when: receivedWhen, line: true });
  }
  if (t.status === 'CLOSED') {
    steps.push({
      tone: 'ok',
      glyph: '✓',
      label: 'Cerrado',
      when: t.closedAt ? fmtDateTime(t.closedAt) : '—',
      line: false,
    });
  } else {
    steps.push({
      tone: 'pending',
      glyph: '•',
      label: 'Pendiente de cierre',
      when: 'Abierto',
      line: false,
    });
  }
  return steps;
}

export function buildTransferDetail(
  t: Transfer,
  nameOf: StoreNameResolver,
  resolveProduct: ProductResolver,
): TransferDetail {
  const meta = statusMeta(t);
  const lc = t.lines.length;
  const u = unitsSent(t);
  const showRecv = t.status === 'RECEIVED' || t.status === 'CLOSED';
  const lines: DrawerLine[] = t.lines.map((l) => {
    const p = resolveProduct(l.productId);
    const received = lineReceived(l);
    const sent = lineSent(l);
    const short = received != null && received < sent;
    const right = showRecv && received != null ? `${received} / ${sent}` : `${sent} uds`;
    return { id: l.id, name: p.name, sku: p.sku, right, short };
  });
  const missing = u - unitsReceived(t);
  // Incidencias de la revisión: líneas con faltante y/o comentario del empleado.
  const incidents: ReviewIncident[] = t.lines.flatMap((l) => {
    const p = resolveProduct(l.productId);
    const received = lineReceived(l);
    const sent = lineSent(l);
    const short = received != null && received < sent;
    const note = l.discrepancyNote && l.discrepancyNote.trim() !== '' ? l.discrepancyNote : null;
    if (!short && !note) return [];
    return [
      {
        product: p.name,
        note,
        qtyLabel: received != null ? `${received} / ${sent}` : `${sent}`,
        short,
      },
    ];
  });
  const reviewState: ReviewState = !showRecv
    ? 'pending'
    : incidents.length === 0
      ? 'perfect'
      : t.incidentResolvedAt != null
        ? 'resolved'
        : 'incidents';
  return {
    id: t.id,
    primary: transferLabel(t, nameOf),
    routeLine: `${transferRoute(t, nameOf)} · ${lc} ${lc === 1 ? 'línea' : 'líneas'}`,
    avatarText: nameOf(t.originStoreId).slice(0, 3).toUpperCase(),
    statusKey: meta.key,
    statusLabel: meta.label,
    tone: meta.tone,
    glyph: meta.glyph,
    meta: [
      { label: 'Referencia', value: transferRef(t.id) },
      { label: 'Estado', value: meta.label },
      { label: 'Creado', value: fmtDateTime(t.createdAt) },
      { label: 'Origen', value: nameOf(t.originStoreId) },
      { label: 'Destino', value: nameOf(t.destStoreId) },
      { label: 'Líneas', value: String(lc) },
    ],
    lines,
    lineTotalLabel: showRecv ? 'Recibidas / enviadas' : 'Unidades enviadas',
    unitsLabel: String(u),
    hasIncidence: meta.key === 'incid',
    incidenceNote:
      meta.key === 'incid'
        ? `Incidencia: faltan ${missing} ${missing === 1 ? 'unidad' : 'unidades'} respecto a lo enviado.`
        : '',
    reviewState,
    incidents,
    timeline: buildTimeline(t),
    action: primaryAction(t),
  };
}

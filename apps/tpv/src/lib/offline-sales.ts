import type { CreateSaleInput } from '@simpletpv/auth';

import { api } from './auth.js';

// Venta offline (offline slice 2c). Cuando el TPV no tiene conexión, la venta se
// encola en localStorage con un clientId (idempotencia) y un nº de ticket tomado
// de un BLOQUE reservado previamente online (POST /sales/ticket-block). Al volver
// la conexión, syncOutbox() reenvía cada venta a POST /sales; el backend es
// idempotente por clientId, así que reintentar es seguro.

const OUTBOX_KEY = 'simpletpv.tpv.outbox';
const blockKey = (storeId: string): string => `simpletpv.tpv.ticketblock.${storeId}`;

// Tamaño del bloque a reservar y umbral por debajo del cual se repone (online).
const BLOCK_SIZE = 50;
const REPLENISH_BELOW = 10;

export interface QueuedSale {
  clientId: string;
  ticketNumber: string;
  total: string; // total mostrado en el momento del cobro (calculado por el carrito)
  input: CreateSaleInput; // payload listo para POST /sales (con clientId + ticketNumber)
  queuedAt: string;
}

interface TicketBlock {
  storeId: string;
  code: string;
  next: number; // siguiente número a consumir
  to: number; // último número del bloque (inclusive)
}

// Mismo formato que formatTicket del API (apps/api/src/sales/sales.domain.ts).
// DEBE coincidir con el servidor: "T" + code + "-" + contador a 6 dígitos.
function formatTicket(code: string, counter: number): string {
  return `T${code}-${String(counter).padStart(6, '0')}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readOutbox(): QueuedSale[] {
  return readJson<QueuedSale[]>(OUTBOX_KEY, []);
}

function writeOutbox(list: QueuedSale[]): void {
  window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(list));
  notify();
}

export function outboxCount(): number {
  return readOutbox().length;
}

function readBlock(storeId: string): TicketBlock | null {
  return readJson<TicketBlock | null>(blockKey(storeId), null);
}

function writeBlock(storeId: string, block: TicketBlock): void {
  window.localStorage.setItem(blockKey(storeId), JSON.stringify(block));
}

// Reserva/repone el bloque de tickets para una tienda. Llamar cuando HAY conexión
// (p.ej. al entrar en la tienda y al sincronizar). No-op si el bloque actual aún
// tiene margen suficiente. Silencioso ante error de red (se reintenta luego).
export async function ensureTicketBlock(storeId: string): Promise<void> {
  const current = readBlock(storeId);
  const remaining = current ? current.to - current.next + 1 : 0;
  if (remaining > REPLENISH_BELOW) {
    return;
  }
  try {
    const res = await api.post<{ code: string; from: number; to: number }>('/sales/ticket-block', {
      storeId,
      size: BLOCK_SIZE,
    });
    // Si quedaban números del bloque viejo se descartan (gaps justificados por
    // reserva); el bloque nuevo arranca en res.from.
    writeBlock(storeId, { storeId, code: res.code, next: res.from, to: res.to });
  } catch {
    // Sin conexión o error: se mantiene el bloque actual; se reintentará.
  }
}

// Cuántos tickets quedan en el bloque de la tienda (para avisar si está bajo).
export function ticketsRemaining(storeId: string): number {
  const b = readBlock(storeId);
  return b ? Math.max(0, b.to - b.next + 1) : 0;
}

function takeTicketNumber(storeId: string): string | null {
  const b = readBlock(storeId);
  if (!b || b.next > b.to) {
    return null;
  }
  const ticketNumber = formatTicket(b.code, b.next);
  writeBlock(storeId, { ...b, next: b.next + 1 });
  return ticketNumber;
}

function uuid(): string {
  return crypto.randomUUID();
}

// Encola una venta offline. Devuelve { clientId, ticketNumber } o null si no hay
// bloque de tickets disponible (no se puede vender offline → hay que conectar
// para reservar un bloque).
export function enqueueSale(input: CreateSaleInput, total: string): QueuedSale | null {
  const ticketNumber = takeTicketNumber(input.storeId);
  if (!ticketNumber) {
    return null;
  }
  const clientId = uuid();
  const queued: QueuedSale = {
    clientId,
    ticketNumber,
    total,
    input: { ...input, clientId, ticketNumber },
    queuedAt: new Date().toISOString(),
  };
  writeOutbox([...readOutbox(), queued]);
  return queued;
}

// Reenvía las ventas encoladas al API. Idempotente por clientId: una venta ya
// sincronizada antes se devuelve sin duplicar. Las que fallan se mantienen en la
// cola para el siguiente intento.
export async function syncOutbox(): Promise<{ synced: number; failed: number }> {
  const list = readOutbox();
  if (list.length === 0) {
    return { synced: 0, failed: 0 };
  }
  const remaining: QueuedSale[] = [];
  let synced = 0;
  let failed = 0;
  for (const q of list) {
    try {
      await api.post('/sales', q.input);
      synced += 1;
    } catch {
      failed += 1;
      remaining.push(q);
    }
  }
  writeOutbox(remaining);
  return { synced, failed };
}

// Suscripción ligera para que la UI refleje el nº de ventas en cola.
type Listener = () => void;
const listeners = new Set<Listener>();
function notify(): void {
  for (const l of listeners) l();
}
export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

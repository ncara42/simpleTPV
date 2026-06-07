import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted: el factory de vi.mock se eleva al top; `post` debe existir antes.
const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('./auth.js', () => ({ api: { post } }));

import {
  enqueueSale,
  ensureTicketBlock,
  outboxCount,
  syncOutbox,
  ticketsRemaining,
} from './offline-sales.js';

const STORE = 'store-1';
const input = {
  storeId: STORE,
  lines: [{ productId: 'p1', qty: 1 }],
  paymentMethod: 'CASH' as const,
};

beforeEach(() => {
  window.localStorage.clear();
  post.mockReset();
});

describe('offline-sales', () => {
  it('sin bloque reservado, enqueueSale devuelve null (no se puede vender offline)', () => {
    expect(enqueueSale(input, '10.00')).toBeNull();
    expect(outboxCount()).toBe(0);
  });

  it('ensureTicketBlock reserva un bloque cuando no hay', async () => {
    post.mockResolvedValueOnce({ code: '01', from: 1, to: 50 });
    await ensureTicketBlock(STORE);
    expect(post).toHaveBeenCalledWith('/sales/ticket-block', { storeId: STORE, size: 50 });
    expect(ticketsRemaining(STORE)).toBe(50);
  });

  it('enqueueSale toma un nº del bloque, lo consume y encola con clientId+ticketNumber', async () => {
    post.mockResolvedValueOnce({ code: '01', from: 1, to: 50 });
    await ensureTicketBlock(STORE);

    const q = enqueueSale(input, '12.10');
    expect(q).not.toBeNull();
    expect(q!.ticketNumber).toBe('T01-000001');
    expect(q!.clientId).toMatch(/[0-9a-f-]{36}/i);
    expect(q!.input.clientId).toBe(q!.clientId);
    expect(q!.input.ticketNumber).toBe('T01-000001');
    expect(q!.total).toBe('12.10');
    expect(outboxCount()).toBe(1);
    expect(ticketsRemaining(STORE)).toBe(49); // consumió 1 del bloque
  });

  it('syncOutbox reenvía las ventas y vacía la cola; mantiene las que fallan', async () => {
    post.mockResolvedValueOnce({ code: '01', from: 1, to: 50 });
    await ensureTicketBlock(STORE);
    enqueueSale(input, '1');
    enqueueSale(input, '2');
    expect(outboxCount()).toBe(2);

    // 1ª venta OK, 2ª falla (red) → queda en la cola.
    post.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('red'));
    const res = await syncOutbox();

    expect(res).toEqual({ synced: 1, failed: 1 });
    expect(outboxCount()).toBe(1);
  });

  it('ensureTicketBlock no repone si quedan suficientes números', async () => {
    post.mockResolvedValueOnce({ code: '01', from: 1, to: 50 });
    await ensureTicketBlock(STORE);
    post.mockReset();
    await ensureTicketBlock(STORE); // 50 restantes > umbral → no llama al API
    expect(post).not.toHaveBeenCalled();
  });
});

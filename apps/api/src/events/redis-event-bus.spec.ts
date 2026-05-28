import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import type { AppEvent } from './event-bus.interface.js';
import { RedisEventBus } from './redis-event-bus.js';

const ORG = 'org-1';

// Fake de la conexión de suscripción: captura el handler de 'message' y permite
// emitir mensajes manualmente para simular lo que llega de Redis.
function makeSubFake() {
  let handler: ((ch: string, msg: string) => void) | undefined;
  return {
    redis: {
      on: vi.fn((event: string, cb: (ch: string, msg: string) => void) => {
        if (event === 'message') handler = cb;
      }),
      off: vi.fn(),
      subscribe: vi.fn(async () => 1),
      quit: vi.fn(async () => 'OK'),
      disconnect: vi.fn(),
    } as unknown as Redis,
    emit: (ch: string, msg: string) => handler?.(ch, msg),
  };
}

describe('RedisEventBus', () => {
  it('publish hace PUBLISH al canal del tenant con el evento serializado', async () => {
    const pub = { publish: vi.fn(async () => 1) } as unknown as Redis;
    const bus = new RedisEventBus(pub, () => ({}) as Redis);

    await bus.publish(ORG, { type: 'stock.changed', data: { productId: 'p1' } });

    expect(pub.publish).toHaveBeenCalledWith(
      `events:${ORG}`,
      JSON.stringify({ type: 'stock.changed', data: { productId: 'p1' } }),
    );
  });

  it('publish no propaga si Redis falla (best-effort)', async () => {
    const pub = {
      publish: vi.fn(async () => {
        throw new Error('down');
      }),
    } as unknown as Redis;
    const bus = new RedisEventBus(pub, () => ({}) as Redis);
    await expect(bus.publish(ORG, { type: 'sale.completed', data: {} })).resolves.toBeUndefined();
  });

  it('subscribe reenvía solo los mensajes del canal del tenant', async () => {
    const sub = makeSubFake();
    const bus = new RedisEventBus({} as Redis, () => sub.redis);
    const received: AppEvent[] = [];
    bus.subscribe(ORG).subscribe((e) => received.push(e));

    // Mensaje de otro canal: se ignora.
    sub.emit('events:otra-org', JSON.stringify({ type: 'stock.changed', data: {} }));
    // Mensaje del canal correcto: se reenvía.
    sub.emit(`events:${ORG}`, JSON.stringify({ type: 'alert.created', data: { productId: 'p9' } }));

    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe('alert.created');
  });

  it('subscribe ignora mensajes malformados sin romper', async () => {
    const sub = makeSubFake();
    const bus = new RedisEventBus({} as Redis, () => sub.redis);
    const received: AppEvent[] = [];
    bus.subscribe(ORG).subscribe((e) => received.push(e));

    sub.emit(`events:${ORG}`, 'no-es-json{');
    expect(received).toHaveLength(0);
  });
});

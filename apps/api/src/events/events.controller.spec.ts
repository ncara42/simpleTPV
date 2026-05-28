import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { describe, expect, it } from 'vitest';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { EventsController } from './events.controller.js';
import { InMemoryEventBus } from './in-memory-event-bus.js';

const ORG = 'org-1';

function req(organizationId: string): { user: JwtPayload } {
  return { user: { sub: 'u', organizationId, role: 'CLERK' } };
}

describe('EventsController', () => {
  it('emite los eventos del tenant del JWT como MessageEvent', async () => {
    const bus = new InMemoryEventBus();
    const controller = new EventsController(bus);

    // Nos suscribimos al stream y tomamos el primer evento que no sea heartbeat.
    const firstEvent = firstValueFrom(
      controller.stream(req(ORG)).pipe(
        filter((m) => m.type !== 'ping'),
        take(1),
      ),
    );

    await bus.publish(ORG, { type: 'stock.changed', data: { productId: 'p1', quantity: 5 } });

    const msg = await firstEvent;
    expect(msg.type).toBe('stock.changed');
    expect(msg.data).toMatchObject({ productId: 'p1', quantity: 5 });
  });

  it('no emite eventos de otra organización (filtrado por servidor)', async () => {
    const bus = new InMemoryEventBus();
    const controller = new EventsController(bus);

    const received: unknown[] = [];
    const sub = controller
      .stream(req(ORG))
      .pipe(filter((m) => m.type !== 'ping'))
      .subscribe((m) => received.push(m));

    // Evento de OTRA org: el stream del usuario de ORG no debe recibirlo.
    await bus.publish('org-2', { type: 'sale.completed', data: {} });
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toHaveLength(0);
    sub.unsubscribe();
  });
});

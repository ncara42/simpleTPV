import { HttpException } from '@nestjs/common';
import { firstValueFrom, type Subscription } from 'rxjs';
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

describe('EventsController — límite de conexiones SSE por usuario (SEC-03)', () => {
  // Default de SSE_MAX_CONNECTIONS_PER_USER (config/security.ts).
  const MAX = 5;
  const reqAs = (sub: string): { user: JwtPayload } => ({
    user: { sub, organizationId: ORG, role: 'CLERK' },
  });

  it('permite hasta el máximo y rechaza con 429 al superarlo; se libera al cerrar', () => {
    const controller = new EventsController(new InMemoryEventBus());
    const subs: Subscription[] = [];

    // Abre el máximo de conexiones del MISMO usuario y las mantiene activas.
    for (let i = 0; i < MAX; i++) {
      subs.push(controller.stream(reqAs('u1')).subscribe());
    }

    // La siguiente conexión de u1 se rechaza con 429.
    let thrown: unknown;
    try {
      controller.stream(reqAs('u1'));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(429);

    // Otro usuario NO se ve afectado por el cupo de u1.
    expect(() => controller.stream(reqAs('u2')).subscribe().unsubscribe()).not.toThrow();

    // Al cerrar una conexión de u1 se libera un hueco y puede reconectar.
    subs[0]!.unsubscribe();
    expect(() => controller.stream(reqAs('u1')).subscribe().unsubscribe()).not.toThrow();

    for (const s of subs) {
      s.unsubscribe();
    }
  });
});

import { describe, expect, it } from 'vitest';

import type { AppEvent } from './event-bus.interface.js';
import { InMemoryEventBus } from './in-memory-event-bus.js';

const ORG = 'org-1';

describe('InMemoryEventBus', () => {
  it('entrega a los suscriptores del mismo tenant', async () => {
    const bus = new InMemoryEventBus();
    const received: AppEvent[] = [];
    bus.subscribe(ORG).subscribe((e) => received.push(e));

    await bus.publish(ORG, { type: 'stock.changed', data: { productId: 'p1' } });

    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe('stock.changed');
  });

  it('aísla por tenant: un suscriptor de otra org no recibe', async () => {
    const bus = new InMemoryEventBus();
    const received: AppEvent[] = [];
    bus.subscribe('org-2').subscribe((e) => received.push(e));

    await bus.publish(ORG, { type: 'sale.completed', data: {} });

    expect(received).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';

import { StoreOrdersModule } from './store-orders.module.js';

describe('StoreOrdersModule', () => {
  it('queda definido', () => {
    expect(StoreOrdersModule).toBeDefined();
  });
});

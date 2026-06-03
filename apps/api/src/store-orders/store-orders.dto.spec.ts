import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import {
  CreateStoreOrderDto,
  CreateStoreOrderLineDto,
  ReceiveStoreOrderDto,
  ReceiveStoreOrderLineDto,
} from './store-orders.dto.js';

describe('store-orders dto aliases', () => {
  it('reexporta los DTOs legacy de transfers', () => {
    expect(CreateStoreOrderDto).toBeDefined();
    expect(CreateStoreOrderLineDto).toBeDefined();
    expect(ReceiveStoreOrderDto).toBeDefined();
    expect(ReceiveStoreOrderLineDto).toBeDefined();
  });
});

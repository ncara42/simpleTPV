import 'reflect-metadata'; // los decoradores de class-validator lo necesitan (lo carga Nest en runtime)

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateCashMovementDto } from '../cash-sessions/cash-sessions.dto.js';
import { CreatePurchaseOrderLineDto } from '../purchases/purchases.dto.js';
import { CreateReturnLineDto } from '../returns/returns.dto.js';
import { CreateSaleDto, CreateSaleLineDto } from '../sales/sales.dto.js';
import { AdjustStockDto } from '../stock/stock.dto.js';
import { CreateTransferLineDto } from '../transfers/transfers.dto.js';

const UUID = '11111111-1111-1111-1111-111111111111';

// Propiedades que fallan validación (mismas reglas que la ValidationPipe global).
async function failed(cls: new () => object, obj: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, obj), { whitelist: true });
  return errors.map((e) => e.property);
}

// A-03 / SEC-15: las cantidades e importes transaccionales deben rechazar valores
// con exceso de decimales (Postgres los redondearía → divergencia contable) o por
// encima de la precisión Decimal (reventarían el INSERT con un 500 en vez de un 400).
describe('A-03: cotas y escala decimal de los DTOs transaccionales', () => {
  it('CreateSaleLineDto.qty: ≤3 decimales, >0 y ≤ MAX_QUANTITY', async () => {
    expect(await failed(CreateSaleLineDto, { productId: UUID, qty: 2.5 })).not.toContain('qty');
    expect(await failed(CreateSaleLineDto, { productId: UUID, qty: 1.2345 })).toContain('qty'); // 4 dec
    expect(await failed(CreateSaleLineDto, { productId: UUID, qty: 1e9 })).toContain('qty'); // > cota
    expect(await failed(CreateSaleLineDto, { productId: UUID, qty: 0 })).toContain('qty'); // no positivo
  });

  it('CreateSaleLineDto.discountAmt: importe ≤2 decimales y ≤ MAX_AMOUNT', async () => {
    const base = { productId: UUID, qty: 1 };
    expect(await failed(CreateSaleLineDto, { ...base, discountAmt: 1.23 })).not.toContain(
      'discountAmt',
    );
    expect(await failed(CreateSaleLineDto, { ...base, discountAmt: 1.234 })).toContain(
      'discountAmt',
    );
    expect(await failed(CreateSaleLineDto, { ...base, discountAmt: 1e11 })).toContain(
      'discountAmt',
    );
  });

  it('CreateSaleDto.cashGiven: importe ≤2 decimales y ≤ MAX_AMOUNT', async () => {
    const base = { storeId: UUID, paymentMethod: 'CASH', lines: [{ productId: UUID, qty: 1 }] };
    expect(await failed(CreateSaleDto, { ...base, cashGiven: 100.5 })).not.toContain('cashGiven');
    expect(await failed(CreateSaleDto, { ...base, cashGiven: 100.555 })).toContain('cashGiven');
  });

  it('CreateCashMovementDto.amount: importe ≤2 decimales y ≤ MAX_AMOUNT', async () => {
    const base = { type: 'OUT', reason: 'Retirada' };
    expect(await failed(CreateCashMovementDto, { ...base, amount: 25.5 })).not.toContain('amount');
    expect(await failed(CreateCashMovementDto, { ...base, amount: 25.555 })).toContain('amount');
    expect(await failed(CreateCashMovementDto, { ...base, amount: 1e12 })).toContain('amount');
  });

  it('AdjustStockDto.newQuantity: cantidad ≤3 decimales', async () => {
    const base = { productId: UUID, storeId: UUID, reason: 'Recuento' };
    expect(await failed(AdjustStockDto, { ...base, newQuantity: 5.123 })).not.toContain(
      'newQuantity',
    );
    expect(await failed(AdjustStockDto, { ...base, newQuantity: 5.1234 })).toContain('newQuantity');
  });

  it('CreatePurchaseOrderLineDto.unitCost: precio ≤4 decimales y ≤ MAX_PRICE', async () => {
    const base = { productId: UUID, quantityOrdered: 1 };
    expect(await failed(CreatePurchaseOrderLineDto, { ...base, unitCost: 1.2345 })).not.toContain(
      'unitCost',
    );
    expect(await failed(CreatePurchaseOrderLineDto, { ...base, unitCost: 1.23456 })).toContain(
      'unitCost',
    ); // 5 dec
    expect(await failed(CreatePurchaseOrderLineDto, { ...base, unitCost: 1e7 })).toContain(
      'unitCost',
    ); // > MAX_PRICE
  });

  it('CreateTransferLineDto.quantitySent y CreateReturnLineDto.qty quedan acotadas', async () => {
    expect(await failed(CreateTransferLineDto, { productId: UUID, quantitySent: 1e9 })).toContain(
      'quantitySent',
    );
    expect(await failed(CreateReturnLineDto, { saleLineId: UUID, qty: 1.2345 })).toContain('qty');
  });
});

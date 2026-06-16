import 'reflect-metadata'; // los decoradores de class-validator lo necesitan (lo carga Nest en runtime)

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateWholesaleOrderDto, ListWholesaleOrdersQueryDto } from '../b2b/b2b.dto.js';
import { CreateCashMovementDto } from '../cash-sessions/cash-sessions.dto.js';
import { CreateDeviceDto, PairDeviceDto } from '../devices/devices.dto.js';
import { CreateFamilyDto } from '../product-families/product-families.dto.js';
import { CreateProductDto } from '../products/products.dto.js';
import { CreatePurchaseOrderLineDto, SuggestPurchaseOrderDto } from '../purchases/purchases.dto.js';
import { CreateReturnLineDto } from '../returns/returns.dto.js';
import { CreateSaleDto, CreateSaleLineDto, ListSalesQueryDto } from '../sales/sales.dto.js';
import { AdjustStockDto } from '../stock/stock.dto.js';
import { CreateStoreDto } from '../stores/stores.dto.js';
import { CreateSupplierDto } from '../suppliers/suppliers.dto.js';
import { CreateTransferLineDto } from '../transfers/transfers.dto.js';
import { AssignStoresDto } from '../users/users.dto.js';
import {
  MAX_ARRAY_SIZE,
  MAX_CODE_LENGTH,
  MAX_COVERAGE_DAYS,
  MAX_NAME_LENGTH,
  MAX_NIF_LENGTH,
  MAX_PAGE,
  MAX_SEARCH_LENGTH,
} from './limits.js';

const UUID = '11111111-1111-1111-1111-111111111111';

// Cadena de N caracteres para probar el límite superior de longitud.
const repeat = (n: number): string => 'a'.repeat(n);

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

// VAL-02/03/06/07, KEY-04, INJ-02 (issue #111): las entradas no numéricas
// (cadenas TEXT sin límite nativo, arrays, page/OFFSET) deben rechazar tamaños
// abusivos que el ValidationPipe con whitelist no acota por sí solo.
describe('#111: endurecimiento de validación de entrada en DTOs', () => {
  // UUID v4 válido (variante/version correctas) para los DTOs con @IsUUID('4').
  const UUID4 = '11111111-1111-4111-8111-111111111111';

  describe('@MaxLength en campos string', () => {
    it('CreateProductDto.name: acepta el límite y rechaza superarlo', async () => {
      const base = { salePrice: 1 };
      expect(
        await failed(CreateProductDto, { ...base, name: repeat(MAX_NAME_LENGTH) }),
      ).not.toContain('name');
      expect(
        await failed(CreateProductDto, { ...base, name: repeat(MAX_NAME_LENGTH + 1) }),
      ).toContain('name');
    });

    it('CreateProductDto.barcode/sku/description acotados', async () => {
      const base = { name: 'X', salePrice: 1 };
      expect(await failed(CreateProductDto, { ...base, barcode: repeat(101) })).toContain(
        'barcode',
      );
      expect(await failed(CreateProductDto, { ...base, sku: repeat(101) })).toContain('sku');
      expect(await failed(CreateProductDto, { ...base, description: repeat(1001) })).toContain(
        'description',
      );
    });

    it('CreateStoreDto.code acotado a MAX_CODE_LENGTH', async () => {
      const base = { name: 'Tienda' };
      expect(
        await failed(CreateStoreDto, { ...base, code: repeat(MAX_CODE_LENGTH) }),
      ).not.toContain('code');
      expect(
        await failed(CreateStoreDto, { ...base, code: repeat(MAX_CODE_LENGTH + 1) }),
      ).toContain('code');
    });

    it('CreateSupplierDto.nif acotado a MAX_NIF_LENGTH', async () => {
      const base = { name: 'Proveedor' };
      expect(
        await failed(CreateSupplierDto, { ...base, nif: repeat(MAX_NIF_LENGTH + 1) }),
      ).toContain('nif');
    });

    it('CreateFamilyDto.name acotado', async () => {
      expect(await failed(CreateFamilyDto, { name: repeat(MAX_NAME_LENGTH + 1) })).toContain(
        'name',
      );
    });
  });

  describe('@ArrayMaxSize en arrays', () => {
    it('CreateWholesaleOrderDto.lines rechaza más de MAX_ARRAY_SIZE líneas', async () => {
      const line = { productId: UUID4, qty: 1 };
      const ok = { customerId: UUID4, lines: Array.from({ length: MAX_ARRAY_SIZE }, () => line) };
      const tooMany = {
        customerId: UUID4,
        lines: Array.from({ length: MAX_ARRAY_SIZE + 1 }, () => line),
      };
      expect(await failed(CreateWholesaleOrderDto, ok)).not.toContain('lines');
      expect(await failed(CreateWholesaleOrderDto, tooMany)).toContain('lines');
    });

    it('AssignStoresDto.storeIds rechaza más de MAX_ARRAY_SIZE IDs', async () => {
      // UUID v4 válidos y únicos (los 4 últimos hex varían por índice).
      const tooMany = Array.from(
        { length: MAX_ARRAY_SIZE + 1 },
        (_v, i) => `11111111-1111-4111-8111-11111111${i.toString(16).padStart(4, '0')}`,
      );
      expect(await failed(AssignStoresDto, { storeIds: tooMany })).toContain('storeIds');
    });
  });

  describe('@Max en page / daysCoverage', () => {
    it('ListSalesQueryDto.page rechaza por encima de MAX_PAGE', async () => {
      expect(await failed(ListSalesQueryDto, { page: MAX_PAGE })).not.toContain('page');
      expect(await failed(ListSalesQueryDto, { page: MAX_PAGE + 1 })).toContain('page');
    });

    it('ListWholesaleOrdersQueryDto.page rechaza por encima de MAX_PAGE', async () => {
      expect(await failed(ListWholesaleOrdersQueryDto, { page: MAX_PAGE + 1 })).toContain('page');
    });

    it('SuggestPurchaseOrderDto.daysCoverage entero y ≤ MAX_COVERAGE_DAYS', async () => {
      const base = { storeId: UUID };
      expect(
        await failed(SuggestPurchaseOrderDto, { ...base, daysCoverage: MAX_COVERAGE_DAYS }),
      ).not.toContain('daysCoverage');
      expect(
        await failed(SuggestPurchaseOrderDto, { ...base, daysCoverage: MAX_COVERAGE_DAYS + 1 }),
      ).toContain('daysCoverage');
      expect(await failed(SuggestPurchaseOrderDto, { ...base, daysCoverage: 1.5 })).toContain(
        'daysCoverage',
      );
    });
  });

  describe('búsqueda y emparejamiento de dispositivos', () => {
    it('ListSalesQueryDto.q acotado a MAX_SEARCH_LENGTH', async () => {
      expect(await failed(ListSalesQueryDto, { q: repeat(MAX_SEARCH_LENGTH) })).not.toContain('q');
      expect(await failed(ListSalesQueryDto, { q: repeat(MAX_SEARCH_LENGTH + 1) })).toContain('q');
    });

    it('PairDeviceDto.pairingToken solo acepta 12 hex en mayúscula', async () => {
      expect(await failed(PairDeviceDto, { pairingToken: 'A1B2C3D4E5F6' })).not.toContain(
        'pairingToken',
      );
      expect(await failed(PairDeviceDto, { pairingToken: 'a1b2c3d4e5f6' })).toContain(
        'pairingToken',
      ); // minúsculas
      expect(await failed(PairDeviceDto, { pairingToken: repeat(1000) })).toContain('pairingToken'); // enorme
    });

    it('CreateDeviceDto.name acotado a MAX_NAME_LENGTH', async () => {
      expect(
        await failed(CreateDeviceDto, { storeId: UUID, name: repeat(MAX_NAME_LENGTH + 1) }),
      ).toContain('name');
    });
  });
});

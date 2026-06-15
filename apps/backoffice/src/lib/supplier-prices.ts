import type { ComparisonRow, ImportResult, SupplierPriceRow } from '@simpletpv/auth';

import { api } from './auth.js';

export type { ComparisonRow, ImportResult, SupplierPriceRow };

export function listSupplierPrices(supplierId?: string): Promise<SupplierPriceRow[]> {
  return api.get<SupplierPriceRow[]>('/supplier-prices', {
    ...(supplierId ? { supplierId } : {}),
  });
}

export function upsertSupplierPrice(input: {
  supplierId: string;
  productId: string;
  price: number;
}): Promise<SupplierPriceRow> {
  return api.put<SupplierPriceRow>('/supplier-prices', input);
}

export function deleteSupplierPrice(id: string): Promise<void> {
  return api.del(`/supplier-prices/${id}`);
}

export function compareSupplierPrices(familyId?: string): Promise<ComparisonRow[]> {
  return api.get<ComparisonRow[]>('/supplier-prices/comparison', {
    ...(familyId ? { familyId } : {}),
  });
}

export function importSupplierPricesCsv(supplierId: string, csv: string): Promise<ImportResult> {
  return api.post<ImportResult>('/supplier-prices/import', { supplierId, csv });
}

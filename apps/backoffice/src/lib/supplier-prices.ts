import { api } from './auth.js';

// Resultado de import en lote (espeja el ImportResult del backend).
export interface ImportResult {
  inserted: number;
  errors: Array<{ row: number; message: string }>;
}

export interface SupplierPriceRow {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  sku: string | null;
  price: number;
}

export interface ComparisonRow {
  productId: string;
  productName: string;
  sku: string | null;
  prices: Array<{ supplierId: string; supplierName: string; price: number }>;
  best: { supplierId: string; supplierName: string; price: number } | null;
}

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

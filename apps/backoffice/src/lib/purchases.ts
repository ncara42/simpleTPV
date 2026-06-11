import type {
  CreatePurchaseOrderInput,
  PurchaseOrder,
  ReceivePurchaseOrderInput,
  SuggestionRow,
  SuggestPurchaseInput,
  Supplier,
  SupplierInput,
} from '@simpletpv/auth';

import { api } from './auth.js';

export type { PurchaseOrder, SuggestionRow, Supplier };

export function listSuppliers(): Promise<Supplier[]> {
  return api.get<Supplier[]>('/suppliers');
}

export function createSupplier(input: SupplierInput): Promise<Supplier> {
  return api.post<Supplier>('/suppliers', input);
}

// Edición desde la vista detalle del proveedor (I-18/D-07).
export function updateSupplier(id: string, input: Partial<SupplierInput>): Promise<Supplier> {
  return api.patch<Supplier>(`/suppliers/${id}`, input);
}

export function deleteSupplier(id: string): Promise<void> {
  return api.del(`/suppliers/${id}`);
}

export function listPurchaseOrders(status?: string, supplierId?: string): Promise<PurchaseOrder[]> {
  return api.get<PurchaseOrder[]>('/purchase-orders', {
    ...(status ? { status } : {}),
    ...(supplierId ? { supplierId } : {}),
  });
}

export function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  return api.get<PurchaseOrder>(`/purchase-orders/${id}`);
}

export function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
  return api.post<PurchaseOrder>('/purchase-orders', input);
}

export function confirmPurchaseOrder(id: string): Promise<PurchaseOrder> {
  return api.post<PurchaseOrder>(`/purchase-orders/${id}/confirm`);
}

export function receivePurchaseOrder(
  id: string,
  input: ReceivePurchaseOrderInput,
): Promise<PurchaseOrder> {
  return api.post<PurchaseOrder>(`/purchase-orders/${id}/receive`, input);
}

export function suggestPurchase(input: SuggestPurchaseInput): Promise<SuggestionRow[]> {
  return api.post<SuggestionRow[]>('/purchase-orders/suggest', input);
}

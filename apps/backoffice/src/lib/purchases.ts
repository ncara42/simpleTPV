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

// Proveedores (#49).
export function listSuppliers(): Promise<Supplier[]> {
  return api.get<Supplier[]>('/suppliers');
}
export function createSupplier(input: SupplierInput): Promise<Supplier> {
  return api.post<Supplier>('/suppliers', input);
}
export function deleteSupplier(id: string): Promise<void> {
  return api.del(`/suppliers/${id}`);
}

// Pedidos.
export function listPurchaseOrders(status?: string): Promise<PurchaseOrder[]> {
  return api.get<PurchaseOrder[]>('/purchase-orders', { status: status || undefined });
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

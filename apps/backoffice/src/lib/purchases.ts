import type {
  CreatePurchaseOrderInput,
  PurchaseOrder,
  ReceivePurchaseOrderInput,
  SuggestionRow,
  SuggestPurchaseInput,
  Supplier,
  SupplierInput,
} from '@simpletpv/auth';

import { isDemo } from './api-config.js';
import { api } from './auth.js';

export type { PurchaseOrder, SuggestionRow, Supplier };

// PROVEEDORES: el backend aún NO expone un controller de suppliers, así que estas
// funciones se quedan en demo en ambos modos (no hay endpoint que llamar). Cuando
// se implemente /suppliers en la API, cablear como el resto. La página de Compras
// está además retirada del menú por ahora (#106).
export function listSuppliers(): Promise<Supplier[]> {
  return Promise.resolve([]);
}
export function createSupplier(input: SupplierInput): Promise<Supplier> {
  return Promise.resolve({
    id: `sup-${input.name}`,
    name: input.name,
    nif: input.nif ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    leadTimeDays: input.leadTimeDays ?? 0,
    active: true,
  });
}
export function deleteSupplier(_id: string): Promise<void> {
  return Promise.resolve();
}

// PEDIDOS DE COMPRA (IT-09): /purchase-orders.
export function listPurchaseOrders(status?: string): Promise<PurchaseOrder[]> {
  if (isDemo()) return Promise.resolve([]); // estado vacío "Sin pedidos abiertos"
  return api.get<PurchaseOrder[]>('/purchase-orders', { ...(status ? { status } : {}) });
}
export function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  if (isDemo()) {
    return Promise.resolve({
      id,
      supplierId: '',
      storeId: '',
      status: 'DRAFT',
      notes: null,
      createdAt: '2026-06-02T10:00:00.000Z',
      confirmedAt: null,
      receivedAt: null,
      lines: [],
    });
  }
  return api.get<PurchaseOrder>(`/purchase-orders/${id}`);
}
export function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
  if (isDemo()) return getPurchaseOrder('po-demo');
  return api.post<PurchaseOrder>('/purchase-orders', input);
}
export function confirmPurchaseOrder(id: string): Promise<PurchaseOrder> {
  if (isDemo()) return getPurchaseOrder(id);
  return api.post<PurchaseOrder>(`/purchase-orders/${id}/confirm`);
}
export function receivePurchaseOrder(
  id: string,
  input: ReceivePurchaseOrderInput,
): Promise<PurchaseOrder> {
  if (isDemo()) return getPurchaseOrder(id);
  return api.post<PurchaseOrder>(`/purchase-orders/${id}/receive`, input);
}
export function suggestPurchase(input: SuggestPurchaseInput): Promise<SuggestionRow[]> {
  if (isDemo()) return Promise.resolve([]);
  return api.post<SuggestionRow[]>('/purchase-orders/suggest', input);
}

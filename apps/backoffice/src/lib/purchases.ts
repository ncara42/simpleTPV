import type {
  CreatePurchaseOrderInput,
  PurchaseOrder,
  ReceivePurchaseOrderInput,
  SuggestionRow,
  SuggestPurchaseInput,
  Supplier,
  SupplierInput,
} from '@simpletpv/auth';

export type { PurchaseOrder, SuggestionRow, Supplier };

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
export function listPurchaseOrders(_status?: string): Promise<PurchaseOrder[]> {
  return Promise.resolve([]); // estado vacío "Sin pedidos abiertos"
}
export function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
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
export function createPurchaseOrder(_input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
  return getPurchaseOrder('po-demo');
}
export function confirmPurchaseOrder(id: string): Promise<PurchaseOrder> {
  return getPurchaseOrder(id);
}
export function receivePurchaseOrder(
  id: string,
  _input: ReceivePurchaseOrderInput,
): Promise<PurchaseOrder> {
  return getPurchaseOrder(id);
}
export function suggestPurchase(_input: SuggestPurchaseInput): Promise<SuggestionRow[]> {
  return Promise.resolve([]);
}

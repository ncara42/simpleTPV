import type {
  AdjustStockInput,
  CreateTransferInput,
  CreateTransferMessageInput,
  ExpiringBatch,
  ReceiveTransferInput,
  SetMinStockInput,
  StockAlert,
  StockGlobalRow,
  StockMovementsPage,
  Transfer,
  TransferMessage,
} from '@simpletpv/auth';

import { api } from './auth.js';

export type {
  AdjustStockInput,
  ExpiringBatch,
  ReceiveTransferInput,
  StockAlert,
  StockGlobalRow,
  Transfer,
  TransferMessage,
};

export function getGlobalStock(): Promise<StockGlobalRow[]> {
  return api.get<StockGlobalRow[]>('/stock/global');
}

export function listAlerts(storeId?: string): Promise<StockAlert[]> {
  return api.get<StockAlert[]>('/stock/alerts', { ...(storeId ? { storeId } : {}) });
}

export function listExpiringBatches(storeId?: string): Promise<ExpiringBatch[]> {
  return api.get<ExpiringBatch[]>('/stock/expiring', { ...(storeId ? { storeId } : {}) });
}

export function setMinStock(input: SetMinStockInput): Promise<unknown> {
  return api.put<unknown>('/stock/min', input);
}

export function listMovements(productId: string): Promise<StockMovementsPage> {
  return api.get<StockMovementsPage>('/stock/movements', { productId });
}

export function listTransfers(status?: string): Promise<Transfer[]> {
  return api.get<Transfer[]>('/transfers', { ...(status ? { status } : {}) });
}

export function createTransfer(input: CreateTransferInput): Promise<Transfer> {
  return api.post<Transfer>('/transfers', input);
}

export function sendTransfer(id: string): Promise<Transfer> {
  return api.post<Transfer>(`/transfers/${id}/send`);
}

// SENT→RECEIVED: registra lo recibido por línea. El backend descuadra el origen al
// enviar y abona el destino al recibir; las líneas con `quantityReceived` < enviado
// generan discrepancia (incidencia) en el traspaso.
export function receiveTransfer(id: string, input: ReceiveTransferInput): Promise<Transfer> {
  return api.post<Transfer>(`/transfers/${id}/receive`, input);
}

// RECEIVED→CLOSED: cierra el traspaso (estado terminal). No mueve stock.
export function closeTransfer(id: string): Promise<Transfer> {
  return api.post<Transfer>(`/transfers/${id}/close`);
}

// Chat del traspaso (hilo entre central y la tienda que recibe).
export function listTransferMessages(id: string): Promise<TransferMessage[]> {
  return api.get<TransferMessage[]>(`/transfers/${id}/messages`);
}

export function postTransferMessage(
  id: string,
  input: CreateTransferMessageInput,
): Promise<TransferMessage> {
  return api.post<TransferMessage>(`/transfers/${id}/messages`, input);
}

export function editTransferMessage(
  id: string,
  messageId: string,
  body: string,
): Promise<TransferMessage> {
  return api.patch<TransferMessage>(`/transfers/${id}/messages/${messageId}`, { body });
}

export function deleteTransferMessage(id: string, messageId: string): Promise<void> {
  return api.del(`/transfers/${id}/messages/${messageId}`);
}

// Marca la incidencia de recepción como solucionada (el traspaso deja de contar como
// incidencia abierta; el chat se conserva).
export function resolveTransferIncident(id: string): Promise<Transfer> {
  return api.post<Transfer>(`/transfers/${id}/resolve-incident`);
}

export function adjustStock(input: AdjustStockInput): Promise<unknown> {
  return api.post('/stock/adjust', input);
}

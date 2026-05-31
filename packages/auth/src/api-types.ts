// Formas de los recursos tal y como los serializa la API (JSON sobre HTTP).
// Los campos Decimal de Prisma viajan como string, de ahí los `string` en precios.
// Fuente de verdad única compartida por TPV y backoffice — antes duplicadas y
// divergentes en cada app.

export type UserRole = 'ADMIN' | 'MANAGER' | 'CLERK';

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  salePrice: string;
  costPrice: string;
  taxRate: string;
  saleUnit: string;
  unitSymbol: string;
  familyId: string | null;
  active: boolean;
}

export interface ProductInput {
  name: string;
  salePrice: number;
  sku?: string | null;
  barcode?: string | null;
  costPrice?: number;
  taxRate?: number;
  familyId?: string | null;
}

export interface FamilyNode {
  id: string;
  parentId: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  children: FamilyNode[];
}

export interface FamilyInput {
  name: string;
  parentId?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
}

export interface NewUser {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

export interface Store {
  id: string;
  name: string;
  address: string | null;
  code: string;
  active: boolean;
}

export interface StoreInput {
  name: string;
  address?: string | null;
}

export interface SaleLine {
  id: string;
  productId: string;
  name: string;
  unitPrice: string;
  qty: string;
  discountPct: string;
  discountAmt: string;
  taxRate: string;
  lineTotal: string;
}

export interface Sale {
  id: string;
  storeId: string;
  userId: string;
  ticketNumber: string;
  subtotal: string;
  discountTotal: string;
  total: string;
  paymentMethod: string;
  cashGiven: string | null;
  cashChange: string | null;
  status: string;
  voidedAt: string | null;
  voidedBy: string | null;
  createdAt: string;
  lines: SaleLine[];
}

// Resumen de venta para el listado/historial que devuelve GET /sales (#14).
// Los Decimal de Prisma viajan como string sobre HTTP, igual que en Sale.
export interface SaleSummary {
  id: string;
  ticketNumber: string;
  createdAt: string;
  total: string;
  paymentMethod: string;
  status: string;
  storeId: string;
}

// Página de ventas con metadatos de paginación y totales del día. `totals`
// agrega SOLO ventas COMPLETED (las VOIDED se listan en items pero no suman).
export interface SalesPage {
  items: SaleSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totals: { count: number; totalAmount: string };
}

// Ticket-resumen para impresión que devuelve GET /sales/:id/ticket.
// Los Decimal de Prisma viajan como string sobre HTTP, igual que en Sale/SaleLine.
export interface TicketLine {
  name: string;
  qty: string;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
}

export interface TaxBreakdownRow {
  taxRate: string;
  base: string;
  cuota: string;
}

export interface SaleTicket {
  organization: { name: string; nif: string | null };
  store: { name: string; code: string };
  ticketNumber: string;
  createdAt: string;
  lines: TicketLine[];
  subtotal: string;
  discountTotal: string;
  total: string;
  paymentMethod: string;
  cashGiven: string | null;
  cashChange: string | null;
  taxBreakdown: TaxBreakdownRow[];
}

export interface CreateSaleInput {
  storeId: string;
  lines: Array<{ productId: string; qty: number; discountPct?: number }>;
  paymentMethod: 'CASH' | 'CARD';
  cashGiven?: number;
  ticketDiscountPct?: number;
  ticketDiscountAmt?: number;
}

// Sesión de caja (apertura/cierre con cuadre). Los Decimal de Prisma viajan
// como string sobre HTTP; los opcionales (cierre) son null mientras la caja
// sigue abierta.
export type CashSessionStatus = 'OPEN' | 'CLOSED';

export interface CashSession {
  id: string;
  storeId: string;
  userId: string;
  openingAmount: string;
  closingAmount: string | null;
  expectedAmount: string | null;
  difference: string | null;
  status: CashSessionStatus;
  openedAt: string;
  closedAt: string | null;
}

export interface OpenCashSessionInput {
  storeId: string;
  openingAmount: number;
}

export interface CloseCashSessionInput {
  countedAmount: number;
}

// Devolución parcial contra un ticket (#15). Los Decimal de Prisma viajan como
// string sobre HTTP, igual que en Sale/SaleLine.
export interface ReturnLine {
  id: string;
  returnId: string;
  saleLineId: string;
  productId: string;
  qty: string;
  lineTotal: string;
}

export interface Return {
  id: string;
  storeId: string;
  userId: string;
  saleId: string;
  reason: string;
  total: string;
  createdAt: string;
  lines: ReturnLine[];
}

export interface CreateReturnInput {
  saleId: string;
  reason: string;
  lines: Array<{ saleLineId: string; qty: number }>;
}

// Devolución SIN ticket (#59): producto + cantidad + motivo + PIN de un
// MANAGER/ADMIN que autoriza. El importe lo calcula el servidor (precio actual).
export interface CreateBlindReturnInput {
  storeId: string;
  reason: string;
  managerPin: string;
  lines: Array<{ productId: string; qty: number }>;
}

// Stock en tiempo real (semana 3). Los Decimal viajan como number en estas
// respuestas (el servicio ya los convierte con Number()). level es el semáforo.
export type StockLevel = 'red' | 'yellow' | 'green';
export type AlertType = 'LOW_STOCK' | 'OUT_OF_STOCK';
export type MovementType =
  | 'SALE'
  | 'RETURN'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'PURCHASE_RECEIPT'
  | 'ADJUSTMENT';

// Fila de GET /stock?storeId= (stock de una tienda).
export interface StockRow {
  productId: string;
  productName: string;
  storeId: string;
  quantity: number;
  minStock: number;
  level: StockLevel;
}

// Entrada de GET /stock/global (por producto, su stock en cada tienda + total).
export interface StockGlobalRow {
  productId: string;
  productName: string;
  total: number;
  stores: Array<{
    storeId: string;
    storeName: string;
    quantity: number;
    minStock: number;
    level: StockLevel;
  }>;
}

// Fila de GET /stock/product/:id (un producto en todas las tiendas).
export interface StockByProductRow {
  productId: string;
  storeId: string;
  storeName: string;
  quantity: number;
  minStock: number;
  level: StockLevel;
}

export interface StockAlert {
  id: string;
  productId: string;
  productName: string;
  storeId: string;
  storeName: string;
  alertType: AlertType;
  resolved: boolean;
  createdAt: string;
}

export interface SetMinStockInput {
  productId: string;
  storeId: string;
  minStock: number;
}

export interface AdjustStockInput {
  productId: string;
  storeId: string;
  newQuantity: number;
  reason: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  storeId: string;
  userId: string | null;
  type: MovementType;
  quantity: string;
  referenceId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface StockMovementsPage {
  items: StockMovement[];
  page: number;
  pageSize: number;
  totalItems: number;
}

// Traspasos central→tienda (semana 3).
export type TransferStatus = 'DRAFT' | 'SENT' | 'RECEIVED' | 'CLOSED';

export interface TransferLine {
  id: string;
  transferId: string;
  productId: string;
  quantitySent: string;
  quantityReceived: string | null;
  discrepancy: string | null;
  discrepancyNote: string | null;
}

export interface Transfer {
  id: string;
  originStoreId: string;
  destStoreId: string;
  status: TransferStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
  receivedAt: string | null;
  closedAt: string | null;
  lines: TransferLine[];
}

export interface CreateTransferInput {
  originStoreId: string;
  destStoreId: string;
  notes?: string;
  lines: Array<{ productId: string; quantitySent: number }>;
}

export interface ReceiveTransferInput {
  lines: Array<{ lineId: string; quantityReceived: number; discrepancyNote?: string }>;
}

// Evento del canal SSE GET /events (semana 3). El cliente filtra por `type`.
export type AppEventType = 'stock.changed' | 'sale.completed' | 'alert.created';
export interface AppEvent {
  type: AppEventType;
  data: Record<string, unknown>;
}

// Compras / proveedores (semana 4).
export interface Supplier {
  id: string;
  name: string;
  nif: string | null;
  email: string | null;
  phone: string | null;
  leadTimeDays: number;
  active: boolean;
}

export interface SupplierInput {
  name: string;
  nif?: string;
  email?: string;
  phone?: string;
  leadTimeDays?: number;
}

export type PurchaseOrderStatus = 'DRAFT' | 'CONFIRMED' | 'PARTIALLY_RECEIVED' | 'RECEIVED';

export interface PurchaseOrderLine {
  id: string;
  productId: string;
  quantityOrdered: string;
  quantityReceived: string;
  unitCost: string | null;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  storeId: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
  receivedAt: string | null;
  lines: PurchaseOrderLine[];
  supplier?: { name: string; leadTimeDays?: number } | Supplier;
  kpis?: { leadTimeDays: number | null; fillRate: number | null };
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  storeId: string;
  notes?: string;
  lines: Array<{ productId: string; quantityOrdered: number; unitCost?: number }>;
}

export interface ReceivePurchaseOrderInput {
  lines: Array<{ lineId: string; quantityReceived: number }>;
}

export interface SuggestPurchaseInput {
  storeId: string;
  supplierId?: string;
  daysCoverage?: number;
}

// VeriFactu: estado de los registros para el panel de salud (#51).
export type VerifactuStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface VerifactuRecord {
  id: string;
  saleId: string | null;
  returnId: string | null;
  type: 'INVOICE' | 'RECTIFICATION';
  status: VerifactuStatus;
  hash: string;
  previousHash: string | null;
  qrData: string | null;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

// Línea de la propuesta de pedido con datos de contexto (#45).
export interface SuggestionRow {
  productId: string;
  productName: string;
  stockActual: number;
  minStock: number;
  ventaMedia30d: number;
  ventaMediaDiaria: number;
  rotacion: number | null;
  coberturaDias: number | null;
  cantidadSugerida: number;
}

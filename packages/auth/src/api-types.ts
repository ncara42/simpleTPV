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

// Resultado de una importación CSV en lote (espejo del ImportResult del backend,
// apps/api/src/common/csv.ts): filas insertadas + errores por número de fila.
export interface ImportResult {
  inserted: number;
  errors: Array<{ row: number; message: string }>;
}

export interface FamilyNode {
  id: string;
  parentId: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  // Arquetipo: nodo que solo contiene productos (no subfamilias). Ver árbol de
  // clasificación del informe de UX.
  isArchetype: boolean;
  children: FamilyNode[];
}

export interface FamilyInput {
  name: string;
  parentId?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
  isArchetype?: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  // Tiendas asignadas (UserStore). Solo lo devuelve GET /users; un ADMIN accede a
  // todas las tiendas y lo lleva vacío. Opcional: /auth/me no lo incluye.
  storeIds?: string[];
}

export interface NewUser {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

// Edición de usuario (PATCH /users/:id): todos los campos opcionales; la
// contraseña solo se cambia si viene informada.
export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
  active?: boolean;
  password?: string;
}

// Perfil del usuario autenticado (GET /me): rol + tiendas asignadas + identidad.
// Lo usan TPV y backoffice para personalizar la cabecera (nombre del empleado) y
// restringir la vista del MANAGER a sus tiendas. La autoridad real sigue siendo el
// backend en cada petición (el JWT solo lleva sub/organizationId/role; el nombre y
// el email se leen aquí del usuario en BD bajo su contexto de tenant).
export interface MeProfile {
  role: UserRole;
  storeIds: string[];
  name: string;
  email: string;
}

// Comparativa de ventas hoy vs ayer (o mes/año) por tienda + total org (STAT-01).
// La sirve GET /dashboard/sales-today (backoffice, ADMIN/MANAGER) y
// GET /tpv/dashboard/sales-today (TPV, también CLERK, acotado a su tienda). Los
// campos `today`/`yesterday` representan "periodo actual"/"anterior". `intraday`
// es el acumulado de hoy por hora con ventas (sparkline); vacío en mes/año.
export interface SalesTodayResponse {
  today: { total: number; count: number };
  yesterday: { total: number; count: number };
  deltaPct: number | null;
  byStore: Array<{
    storeId: string;
    storeName: string;
    today: number;
    yesterday: number;
    deltaPct: number | null;
  }>;
  series?: number[];
  intraday?: number[];
}

// Desglose de ventas por tienda para un periodo arbitrario (#224). La sirve
// GET /dashboard/sales-by-store (backoffice, ADMIN/MANAGER). A diferencia de
// SalesTodayResponse.byStore (fijo a hoy/ayer), acepta cualquier `period` vía
// PeriodQuery. Incluye las tiendas activas de la org, con 0 si no tuvieron ventas.
export interface SalesByStoreItem {
  storeId: string;
  storeName: string;
  revenue: number;
  salesCount: number;
  avgTicket: number;
  margin: number;
  marginPct: number;
}

export interface Store {
  id: string;
  name: string;
  address: string | null;
  code: string;
  active: boolean;
  // Estado operativo manual persistido (D-10). El estado del dispositivo NO va
  // aquí: se deriva de GET /devices (D-10b).
  opsVerified: boolean;
  opsIncident: string | null;
  opsUpdatedAt: string | null;
  // Tienda central de la organización (#146): destino de los traspasos de efectivo.
  // Una sola por organización (índice único parcial en DB).
  isCentral: boolean;
}

export interface StoreOpsInput {
  verified?: boolean;
  incident?: string | null;
}

export interface StoreInput {
  name: string;
  code: string;
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

// Cobro (cuentas por cobrar): canal de la venta y estado de cobro. VENCIDA es un
// estado DERIVADO en el cliente (PENDING + dueDate pasada); el backend solo
// almacena PENDING|PAID.
export type SaleChannel = 'TPV' | 'ONLINE' | 'B2B';
export type SalePaymentStatus = 'PENDING' | 'PAID';

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
  // Factura completa F1 (#230): NIF y razón social del destinatario; null en
  // tickets F2 (factura simplificada).
  customerTaxId: string | null;
  customerName: string | null;
  // Cobro: canal, estado de cobro, vencimiento de la factura a crédito (null al
  // contado) y fecha de cobro (null mientras PENDING).
  channel: SaleChannel;
  paymentStatus: SalePaymentStatus;
  dueDate: string | null;
  paidAt: string | null;
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
  // Destinatario de factura completa F1 (null en F2). El listado lo trae porque
  // aplana la venta completa; el ledger lo usa como nombre de cliente de la fila.
  customerName: string | null;
  // Cobro (ledger de Ventas): canal + estado de cobro + vencimiento + fecha de cobro.
  channel: SaleChannel;
  paymentStatus: SalePaymentStatus;
  dueDate: string | null;
  paidAt: string | null;
}

// Página de ventas con metadatos de paginación y totales del día. `totals`
// agrega SOLO ventas COMPLETED (las VOIDED se listan en items pero no suman).
// avgDiscountPct/avgMarginPct son tasas (0..1) sobre el conjunto filtrado (IT-04).
export interface SalesPage {
  items: SaleSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totals: {
    count: number;
    totalAmount: string;
    avgDiscountPct: number;
    avgMarginPct: number;
    // Split de cobro (solo ventas COMPLETED): cobrado / pendiente / vencido (importe).
    paidTotal: string;
    pendingTotal: string;
    overdueTotal: string;
  };
}

// KPIs de un periodo para las estadísticas embebidas de Ventas (S-10): total
// facturado (string, como en SalesPage.totals) y nº de tickets. El ticket medio se
// deriva en el cliente (totalAmount / count). Solo ventas COMPLETED.
export interface SalesStatsTotals {
  count: number;
  totalAmount: string;
}

// Punto de la serie temporal diaria (S-10): bucket = fecha ISO 'YYYY-MM-DD', con su
// nº de tickets e importe. Solo días con ventas COMPLETED (la BD no rellena huecos).
export interface SalesSeriesPoint {
  bucket: string;
  count: number;
  total: string;
}

// Estadísticas de ventas embebidas (S-10): serie temporal + KPIs del periodo actual
// + KPIs del periodo anterior equivalente. La sirve GET /sales/stats con los MISMOS
// filtros que GET /sales. `previous` es null cuando el filtro no acota un rango de
// fechas (sin from/to/date): sin rango no hay periodo anterior bien definido.
export interface SalesStats {
  series: SalesSeriesPoint[];
  current: SalesStatsTotals;
  previous: SalesStatsTotals | null;
}

// Filtros del historial (#14 + IT-04). Todos opcionales. `userId` filtra por
// vendedor; `from`/`to` (YYYY-MM-DD) acotan por rango; `status` por estado.
export interface SalesQueryInput {
  storeId?: string;
  date?: string;
  from?: string;
  to?: string;
  userId?: string;
  familyId?: string;
  status?: string;
  q?: string;
  // Cobro: canal ('TPV'|'ONLINE'|'B2B') y estado de cobro ('PAID'|'PENDING'|'OVERDUE',
  // OVERDUE virtual). Filtran el ledger de Ventas.
  channel?: string;
  paymentStatus?: string;
  page?: number;
  pageSize?: number;
}

// Ticket-resumen para impresión que devuelve GET /sales/:id/ticket.
// Los Decimal de Prisma viajan como string sobre HTTP, igual que en Sale/SaleLine.
export interface TicketLine {
  name: string;
  qty: string;
  unitPrice: string;
  discountPct: string;
  discountAmt: string;
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
  lines: Array<{ productId: string; qty: number; discountPct?: number; discountAmt?: number }>;
  // El TPV solo usa CASH/CARD; las facturas a crédito (B2B/Online) pueden usar
  // transferencia, Bizum o domiciliación.
  paymentMethod: 'CASH' | 'CARD' | 'TRANSFER' | 'BIZUM' | 'DIRECT_DEBIT';
  cashGiven?: number;
  ticketDiscountPct?: number;
  ticketDiscountAmt?: number;
  // Venta offline (offline slice 2): clientId para idempotencia y ticketNumber
  // pre-asignado de un bloque reservado. En ventas online normales se omiten
  // (clientId puede enviarse igualmente como salvaguarda de reintentos).
  clientId?: string;
  ticketNumber?: string;
  // Factura completa F1 (#230): NIF + razón social del destinatario. Van juntos o
  // ninguno (el backend rechaza solo uno). Ausentes → ticket simplificado F2.
  customerTaxId?: string;
  customerName?: string;
  // Cobro: canal de la venta y vencimiento de cobro. `creditDueDate` (YYYY-MM-DD)
  // marca la venta como factura a crédito (PENDING); solo válido en canal B2B/Online.
  channel?: SaleChannel;
  creditDueDate?: string;
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
  // Anotación del cajero cuando el arqueo no cuadra; null si exacto o sin nota.
  closingNote: string | null;
}

// IN = ingreso en el cajón, OUT = retirada, TRANSFER_OUT = traspaso a la central (#146).
export type CashMovementType = 'IN' | 'OUT' | 'TRANSFER_OUT';

// Flujo solicitud → aprobación (#146): nace PENDING (lo solicita el CLERK) y un
// ADMIN/MANAGER lo APPROVED o DENIED. El cuadre solo cuenta los APPROVED.
export type CashMovementStatus = 'PENDING' | 'APPROVED' | 'DENIED';

export interface CashMovement {
  id: string;
  cashSessionId: string;
  storeId: string;
  userId: string;
  type: CashMovementType;
  amount: string;
  reason: string;
  status: CashMovementStatus;
  // Quién solicitó (sub del JWT) y quién revisó (aprobó/denegó), null mientras PENDING.
  requestedById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  // Destino del traspaso (solo TRANSFER_OUT → tienda central); null en IN/OUT.
  targetStoreId: string | null;
  createdAt: string;
}

// Solicitud PENDING enriquecida para la campana del backoffice (#146): incluye el
// nombre de la tienda de origen y del solicitante (GET /cash-sessions/movements/pending).
export interface PendingCashMovement extends CashMovement {
  store: { name: string };
  requestedBy: { name: string };
}

// Alta directa de movimiento (legacy ADMIN/MANAGER): se crea ya APPROVED.
export interface CreateCashMovementInput {
  type: CashMovementType;
  amount: number;
  reason: string;
}

// Solicitud de movimiento desde el TPV (CLERK/MANAGER/ADMIN): se crea PENDING. El
// destino del traspaso lo resuelve el backend (tienda central de la organización).
export interface RequestCashMovementInput {
  type: CashMovementType;
  amount: number;
  reason: string;
}

export interface OpenCashSessionInput {
  storeId: string;
  openingAmount: number;
}

export interface CloseCashSessionInput {
  countedAmount: number;
  // Anotación opcional cuando el arqueo no cuadra (sobra o falta dinero).
  closingNote?: string;
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
// Rotación de un producto (velocidad de venta): alta/media/baja según las unidades
// vendidas en una ventana reciente. La calcula el backend en GET /stock/global.
export type Rotation = 'alta' | 'media' | 'baja';

export interface StockGlobalRow {
  productId: string;
  productName: string;
  total: number;
  rotation: Rotation;
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
  // Anti-rotura por arquetipo (IT-13): hay sustituto de la misma familia con stock.
  hasSubstituteStock: boolean;
  // 'soft' si hay sustituto (rotura no crítica, el cliente sustituye); 'critical' si no.
  severity: 'soft' | 'critical';
  resolved: boolean;
  createdAt: string;
}

// Fila de GET /stock/expiring (#126 slice 4): un lote caducado o por caducar.
// Caducidad computada on-read; ordenadas por expiryDate ascendente (más urgente
// primero). 'expired' si ya caducó, 'expiring' si caduca dentro de la ventana.
export interface ExpiringBatch {
  id: string;
  productId: string;
  productName: string;
  storeId: string;
  storeName: string;
  lotCode: string;
  // Caducidad en formato YYYY-MM-DD (columna @db.Date, sin hora).
  expiryDate: string;
  quantity: number;
  // Días hasta la caducidad: negativo si ya caducó, 0 si caduca hoy.
  daysToExpiry: number;
  status: 'expired' | 'expiring';
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

// Fila de tarifa de compra: precio de un proveedor para un producto.
export interface SupplierPriceRow {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  sku: string | null;
  price: number;
}

// Fila de la comparativa: un producto y su precio en cada proveedor, con el mejor.
export interface ComparisonRow {
  productId: string;
  productName: string;
  sku: string | null;
  prices: Array<{ supplierId: string; supplierName: string; price: number }>;
  best: { supplierId: string; supplierName: string; price: number } | null;
}

export interface InventoryCountLine {
  productId: string;
  countedQuantity: number;
}

export interface ConfirmInventoryCountInput {
  storeId: string;
  reason: string;
  lines: InventoryCountLine[];
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

// Pedidos internos central→tienda. El backend mantiene compatibilidad legacy
// con "transfers", pero el dominio público del TPV es StoreOrder.
export type StoreOrderStatus = 'DRAFT' | 'SENT' | 'RECEIVED' | 'CLOSED';

export interface StoreOrderLine {
  id: string;
  storeOrderId: string;
  productId: string;
  productName?: string;
  barcode?: string | null;
  quantitySent: string;
  quantityReceived: string | null;
  discrepancy: string | null;
  discrepancyNote: string | null;
}

export interface StoreOrder {
  id: string;
  originStoreId: string;
  destStoreId: string;
  status: StoreOrderStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
  receivedAt: string | null;
  closedAt: string | null;
  /** Marca de tiempo en que se resolvió la incidencia de recepción (null si abierta). */
  incidentResolvedAt: string | null;
  lines: StoreOrderLine[];
}

export interface CreateStoreOrderInput {
  originStoreId: string;
  destStoreId: string;
  notes?: string;
  lines: Array<{ productId: string; quantitySent: number }>;
}

export interface ReceiveStoreOrderInput {
  lines: Array<{ lineId: string; quantityReceived: number; discrepancyNote?: string }>;
}

export type TransferStatus = StoreOrderStatus;
export type TransferLine = Omit<StoreOrderLine, 'storeOrderId'> & { transferId: string };
export type Transfer = Omit<StoreOrder, 'lines'> & { lines: TransferLine[] };
export type CreateTransferInput = CreateStoreOrderInput;
export type ReceiveTransferInput = ReceiveStoreOrderInput;

// Adjunto (foto) de la recepción de un traspaso. La imagen viaja como data-URL
// base64 (`dataUrl`), lista para pintar inline; opcionalmente atada a una línea.
export interface TransferAttachment {
  id: string;
  transferLineId: string | null;
  mimeType: string;
  dataUrl: string;
  caption: string | null;
  createdAt: string;
}

export interface CreateTransferAttachmentInput {
  transferLineId?: string | null;
  dataUrl: string;
  caption?: string | null;
}

// Mensaje del chat de traspaso. `author` = 'store' (la tienda que recibe / dependiente)
// o 'central' (backoffice). Lleva texto y/o una foto (`dataUrl`, data-URL base64).
export type TransferMessageAuthor = 'store' | 'central';
export interface TransferMessage {
  id: string;
  author: TransferMessageAuthor;
  body: string | null;
  dataUrl: string | null;
  mimeType: string | null;
  createdAt: string;
}

export interface CreateTransferMessageInput {
  body?: string | null;
  dataUrl?: string | null;
}

export interface OfficialDeviceStatus {
  authorized: boolean;
  device: {
    id: string;
    storeId: string;
    name: string;
    pairedAt: string | null;
    lastSeenAt: string | null;
  } | null;
}

export interface OfficialDevice {
  id: string;
  storeId: string;
  name: string;
  pairingToken: string;
  authorized: boolean;
  pairedAt: string | null;
  lastSeenAt: string | null;
}

export interface CreateOfficialDeviceInput {
  storeId: string;
  name: string;
}

export interface PairDeviceInput {
  pairingToken: string;
}

export type TimeClockType = 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END';

export interface TimeClockEntry {
  id: string;
  storeId: string;
  userId: string;
  deviceId: string | null;
  type: TimeClockType;
  createdAt: string;
}

// Estado derivado de la máquina de fichajes: fuera, fichado o en pausa.
export type TimeClockStatus = 'OUT' | 'IN' | 'BREAK';

// Resumen del día de un empleado, derivado de la secuencia de fichajes.
export interface TimeClockSummary {
  status: TimeClockStatus;
  // ms trabajados hoy (descontando pausas), hasta el corte del servidor.
  workedMs: number;
  // ms en pausa hoy.
  breakMs: number;
  // Marca temporal desde la que el cliente sigue contando en vivo si status === 'IN'.
  runningSince: string | null;
  entries: TimeClockEntry[];
}

// Fila del historial de control horario (backoffice): un día de un empleado.
export interface TimeClockHistoryRow {
  userId: string;
  userName: string;
  storeId: string;
  storeName: string;
  date: string; // YYYY-MM-DD
  firstIn: string | null;
  lastOut: string | null;
  workedMs: number;
  breakMs: number;
}

// Fila del log en bruto de fichajes de una tienda (GET /time-clock/entries): cada
// entrada individual con el nombre del empleado, lo más reciente primero.
export interface TimeClockLogRow {
  id: string;
  userId: string;
  userName: string;
  type: TimeClockType;
  createdAt: string;
}

// Evento del canal SSE GET /events (semana 3). El cliente filtra por `type`.
// cash.movement.requested (#146): un CLERK solicitó un movimiento de efectivo;
// refresca la campana de aprobaciones del backoffice en vivo.
export type AppEventType =
  | 'stock.changed'
  | 'sale.completed'
  | 'alert.created'
  | 'cash.movement.requested'
  // Soporte (Ayuda): respuesta de una persona de soporte (vía Telegram) y cierre
  // de la conversación (vuelta al asistente automático con /cerrar).
  | 'support.message'
  | 'support.closed';
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
  /** Periodicidad de compra (días): 7 semanal, 14 quincenal, 30 mensual…
   *  null = sin definir (la propuesta usa su cobertura por defecto). */
  orderFrequencyDays: number | null;
  active: boolean;
}

export interface SupplierInput {
  name: string;
  nif?: string;
  email?: string;
  phone?: string;
  leadTimeDays?: number;
  /** En update: 0 = quitar la periodicidad; undefined = sin cambios. */
  orderFrequencyDays?: number;
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
  type: 'INVOICE' | 'RECTIFICATION' | 'ANULACION';
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
  /** Unidades ya pedidas y aún sin recibir (en tránsito); ya descontadas. */
  pendienteRecibir: number;
  /** Días de demanda proyectada usados en el cálculo (cobertura + lead time). */
  horizonteDias: number;
  /** Tarifa del proveedor; solo en propuestas por proveedor. */
  precioUnitario: number | null;
  /** precioUnitario · cantidadSugerida (2 decimales). */
  costeEstimado: number | null;
  cantidadSugerida: number;
}

// API keys (IT-18).
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  priceListId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ApiKeyCreated extends ApiKey {
  key: string;
}

export interface CreateApiKeyInput {
  name: string;
  priceListId?: string;
}

// ── B2B mayorista saliente (IT-17) ───────────────────────────────────────────
export interface Customer {
  id: string;
  name: string;
  nif: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  priceListId: string | null;
  // CRM/cartera B2B: segmentos/etiquetas, días de crédito (null/0 = contado),
  // comercial asignado, límite de crédito (Decimal → string, null = sin límite).
  tags: string[];
  paymentTerms: number | null;
  salesRep: string | null;
  creditLimit: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  // En list/update la API incluye la tarifa asignada (id + nombre).
  priceList?: { id: string; name: string } | null;
}

export interface CustomerInput {
  name: string;
  nif?: string;
  email?: string;
  phone?: string;
  address?: string;
  priceListId?: string | null;
  tags?: string[];
  paymentTerms?: number | null;
  salesRep?: string;
  creditLimit?: number | null;
  active?: boolean;
}

// Agregado de cartera por cliente (GET /customers/ledger): se cruza con `Customer`
// por `customerId` en el frontend. Importes Decimal → string; `lastOrderAt` ISO|null.
export interface CustomerLedgerRow {
  customerId: string;
  orderCount: number;
  lastOrderAt: string | null;
  billed12m: string;
  balance: string;
  overdue: string;
}

// Resumen de tarifa (lista). itemCount = precios fijados; customerCount = clientes que la usan.
export interface PriceListSummary {
  id: string;
  name: string;
  active: boolean;
  itemCount: number;
  customerCount: number;
}

// Precio de un producto dentro de una tarifa. price/salePrice son Decimal → string.
export interface PriceListItem {
  id: string;
  productId: string;
  price: string;
  product?: { name: string; salePrice: string };
}

export interface PriceListDetail {
  id: string;
  name: string;
  active: boolean;
  items: PriceListItem[];
}

// Override de precio retail de un producto en una tienda (#127 A). price/salePrice son
// Decimal → string. Sin override para (producto, tienda) → el producto usa su PVP en esa
// tienda. Solo afecta a la venta retail del TPV; el mayorista B2B mantiene su tarifa.
export interface StorePriceOverride {
  id: string;
  productId: string;
  price: string;
  product: { name: string; salePrice: string };
}

// Estado efectivo de los feature flags (#127 B) para una tienda/org: cada módulo →
// activo (true) / apagado (false). Lo sirve GET /me/features (resuelto: override de
// tienda ?? default de org ?? default del código). El backend es la fuente de verdad
// (los endpoints devuelven 403 si el módulo está apagado); el frontend lo usa solo
// para ocultar/des­habilitar UI. Las claves coinciden con el catálogo del backend.
export interface FeatureFlags {
  blind_returns: boolean;
  time_clock: boolean;
  data_export: boolean;
  b2b: boolean;
}

export type FeatureKey = keyof FeatureFlags;

// Entrada del catálogo de módulos (#127 B): clave, etiqueta legible y default del
// código (comportamiento actual). La sirve GET /feature-flags para la UI de gestión.
export interface FeatureFlagCatalogEntry {
  key: FeatureKey;
  label: string;
  default: boolean;
}

// Fila explícita de flag: un default de org (storeId null) o un override de tienda.
export interface FeatureFlagRow {
  key: FeatureKey;
  storeId: string | null;
  enabled: boolean;
}

// Respuesta de gestión (GET /feature-flags): catálogo + filas explícitas del tenant,
// con las que el backoffice pinta la matriz módulos × [org + tiendas] tri-estado.
export interface FeatureFlagsAdmin {
  catalog: FeatureFlagCatalogEntry[];
  flags: FeatureFlagRow[];
}

export type WholesaleOrderStatus = 'DRAFT' | 'CONFIRMED' | 'SHIPPED' | 'CANCELLED';

export interface WholesaleOrderLine {
  id: string;
  productId: string;
  qty: string;
  unitPrice: string;
  lineTotal: string;
  product?: { name: string };
}

// Fila del listado de pedidos mayoristas (paginado).
export interface WholesaleOrderSummary {
  id: string;
  customerId: string;
  customerName: string;
  status: WholesaleOrderStatus;
  total: string;
  lineCount: number;
  // Cobro (cartera B2B): VENCIDO es virtual (PENDING + dueDate pasada).
  paymentStatus: SalePaymentStatus;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface WholesaleOrdersPage {
  items: WholesaleOrderSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
}

export interface WholesaleOrderDetail {
  id: string;
  customerId: string;
  status: WholesaleOrderStatus;
  total: string;
  notes: string | null;
  paymentStatus: SalePaymentStatus;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
  customer: { name: string; nif: string | null };
  lines: WholesaleOrderLine[];
}

export interface CreateWholesaleOrderInput {
  customerId: string;
  notes?: string;
  lines: { productId: string; qty: number }[];
}

export type PromoConditionType = 'min_qty' | 'min_ticket';
export type PromoDiscountType = 'percent' | 'amount';

// Promoción tal y como la serializa la API (#99). discountValue es Decimal → string;
// startDate/endDate son columnas DATE → string ISO. La lib del frontend las normaliza
// a number / 'YYYY-MM-DD' para la UI.
export interface Promotion {
  id: string;
  name: string;
  conditionType: PromoConditionType;
  threshold: number;
  discountType: PromoDiscountType;
  discountValue: string;
  startDate: string;
  endDate: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromotionInput {
  name: string;
  conditionType: PromoConditionType;
  threshold: number;
  discountType: PromoDiscountType;
  discountValue: number;
  startDate: string;
  endDate: string;
  active?: boolean;
}

export type UpdatePromotionInput = Partial<CreatePromotionInput>;

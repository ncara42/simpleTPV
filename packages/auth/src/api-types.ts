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

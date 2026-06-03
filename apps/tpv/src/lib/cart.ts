import type { Product } from '@simpletpv/auth';
import { create } from 'zustand';

export interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  // Descuento de la línea. El importe fijo (discountAmt) tiene precedencia sobre
  // el porcentaje (discountPct), igual que el descuento de ticket. Son
  // mutuamente excluyentes: al fijar uno, el otro vuelve a 0.
  discountPct: number; // 0–100
  discountAmt: number; // importe fijo €, capado al bruto
}

// Redondeo a 2 decimales (céntimos). Misma lógica que el servidor (round2 en
// sales.service.ts) para que el total mostrado coincida con el calculado en API.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Importe efectivo del descuento de una línea: el importe fijo tiene precedencia
// sobre el % y se capa al bruto (mismo criterio que computeTotals en el backend).
// Exportado para que CartPanel muestre el descuento sin duplicar la lógica.
export function lineDiscountOf(item: CartItem): number {
  const gross = round2(item.unitPrice * item.qty);
  return item.discountAmt > 0
    ? round2(Math.min(item.discountAmt, gross))
    : round2((gross * item.discountPct) / 100);
}

interface CartState {
  items: CartItem[];
  // Descuento de ticket: el importe tiene precedencia sobre el porcentaje.
  ticketDiscountPct: number;
  ticketDiscountAmt: number;
  addItem: (product: Pick<Product, 'id' | 'name' | 'salePrice'>) => void;
  setQty: (productId: string, qty: number) => void;
  setLineDiscount: (productId: string, d: { pct?: number; amt?: number }) => void;
  setTicketDiscount: (d: { pct?: number; amt?: number }) => void;
  // Quita todos los descuentos (de línea y de ticket) sin vaciar el carrito.
  clearDiscounts: () => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  lineNet: (item: CartItem) => number;
  subtotal: () => number;
  ticketDiscount: () => number;
  discountTotal: () => number;
  total: () => number;
}

export const useCart = create<CartState>((set, get) => ({
  items: [],
  ticketDiscountPct: 0,
  ticketDiscountAmt: 0,
  addItem: (product) =>
    set((state) => {
      const existing = state.items.find((i) => i.productId === product.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === product.id ? { ...i, qty: i.qty + 1 } : i,
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            productId: product.id,
            name: product.name,
            unitPrice: Number(product.salePrice),
            qty: 1,
            discountPct: 0,
            discountAmt: 0,
          },
        ],
      };
    }),
  setQty: (productId, qty) =>
    set((state) => {
      if (qty <= 0) {
        return { items: state.items.filter((i) => i.productId !== productId) };
      }
      return { items: state.items.map((i) => (i.productId === productId ? { ...i, qty } : i)) };
    }),
  setLineDiscount: (productId, { pct, amt }) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.productId === productId
          ? {
              ...i,
              // Solo uno de los dos: el importe tiene precedencia (como en el ticket).
              ...(amt !== undefined
                ? { discountAmt: Math.max(0, amt), discountPct: 0 }
                : { discountPct: Math.min(100, Math.max(0, pct ?? 0)), discountAmt: 0 }),
            }
          : i,
      ),
    })),
  setTicketDiscount: ({ pct, amt }) =>
    set(() => ({
      // Solo uno de los dos: el importe tiene precedencia (como en el servidor).
      ...(amt !== undefined
        ? { ticketDiscountAmt: Math.max(0, amt), ticketDiscountPct: 0 }
        : { ticketDiscountPct: Math.min(100, Math.max(0, pct ?? 0)), ticketDiscountAmt: 0 }),
    })),
  clearDiscounts: () =>
    set((state) => ({
      items: state.items.map((i) => ({ ...i, discountPct: 0, discountAmt: 0 })),
      ticketDiscountPct: 0,
      ticketDiscountAmt: 0,
    })),
  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),
  clear: () => set({ items: [], ticketDiscountPct: 0, ticketDiscountAmt: 0 }),
  // Neto de una línea: bruto menos su descuento de línea (% o importe fijo).
  lineNet: (item) => round2(round2(item.unitPrice * item.qty) - lineDiscountOf(item)),
  // subtotal = Σ netos de línea (antes del descuento de ticket).
  subtotal: () => round2(get().items.reduce((acc, i) => acc + get().lineNet(i), 0)),
  // Descuento de ticket: importe (capado al subtotal) con precedencia sobre %.
  ticketDiscount: () => {
    const sub = get().subtotal();
    const { ticketDiscountAmt, ticketDiscountPct } = get();
    if (ticketDiscountAmt > 0) {
      return round2(Math.min(ticketDiscountAmt, sub));
    }
    if (ticketDiscountPct > 0) {
      return round2((sub * ticketDiscountPct) / 100);
    }
    return 0;
  },
  // discountTotal = Σ descuentos de línea + descuento de ticket.
  discountTotal: () => {
    const lineDiscounts = round2(get().items.reduce((acc, i) => acc + lineDiscountOf(i), 0));
    return round2(lineDiscounts + get().ticketDiscount());
  },
  // total = subtotal − descuento de ticket.
  total: () => round2(get().subtotal() - get().ticketDiscount()),
}));

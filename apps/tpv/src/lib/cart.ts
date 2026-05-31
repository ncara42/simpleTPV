import type { Product } from '@simpletpv/auth';
import { create } from 'zustand';

export interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  // % de descuento de la línea (0–100). 0 = sin descuento.
  discountPct: number;
}

// Redondeo a 2 decimales (céntimos). Misma lógica que el servidor (round2 en
// sales.service.ts) para que el total mostrado coincida con el calculado en API.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

interface CartState {
  items: CartItem[];
  // Descuento de ticket: el importe tiene precedencia sobre el porcentaje.
  ticketDiscountPct: number;
  ticketDiscountAmt: number;
  addItem: (product: Pick<Product, 'id' | 'name' | 'salePrice'>) => void;
  setQty: (productId: string, qty: number) => void;
  setLineDiscount: (productId: string, pct: number) => void;
  setTicketDiscount: (d: { pct?: number; amt?: number }) => void;
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
  setLineDiscount: (productId, pct) =>
    set((state) => {
      // Capamos el % al rango válido [0, 100].
      const clamped = Math.min(100, Math.max(0, pct));
      return {
        items: state.items.map((i) =>
          i.productId === productId ? { ...i, discountPct: clamped } : i,
        ),
      };
    }),
  setTicketDiscount: ({ pct, amt }) =>
    set(() => ({
      // Solo uno de los dos: el importe tiene precedencia (como en el servidor).
      ...(amt !== undefined
        ? { ticketDiscountAmt: Math.max(0, amt), ticketDiscountPct: 0 }
        : { ticketDiscountPct: Math.min(100, Math.max(0, pct ?? 0)), ticketDiscountAmt: 0 }),
    })),
  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),
  clear: () => set({ items: [], ticketDiscountPct: 0, ticketDiscountAmt: 0 }),
  // Neto de una línea: bruto menos su descuento de línea.
  lineNet: (item) => {
    const gross = round2(item.unitPrice * item.qty);
    const discountAmt = round2((gross * item.discountPct) / 100);
    return round2(gross - discountAmt);
  },
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
    const lineDiscounts = round2(
      get().items.reduce((acc, i) => {
        const gross = round2(i.unitPrice * i.qty);
        return acc + round2((gross * i.discountPct) / 100);
      }, 0),
    );
    return round2(lineDiscounts + get().ticketDiscount());
  },
  // total = subtotal − descuento de ticket.
  total: () => round2(get().subtotal() - get().ticketDiscount()),
}));

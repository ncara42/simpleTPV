import type { Product } from '@simpletpv/auth';
import { create } from 'zustand';

export interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
}

interface CartState {
  items: CartItem[];
  addItem: (product: Pick<Product, 'id' | 'name' | 'salePrice'>) => void;
  setQty: (productId: string, qty: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  subtotal: () => number;
  total: () => number;
}

export const useCart = create<CartState>((set, get) => ({
  items: [],
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
  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),
  clear: () => set({ items: [] }),
  subtotal: () => get().items.reduce((acc, i) => acc + i.unitPrice * i.qty, 0),
  total: () => get().subtotal(),
}));

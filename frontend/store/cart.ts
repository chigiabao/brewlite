// Giỏ hàng bằng Zustand. Người phụ trách: C (Task 5).
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CartItem = {
  productId: number;
  name: string;
  size: 'S' | 'M' | 'L';
  toppings: string[];
  unitPrice: number;
  qty: number;
};

const keyOf = (i: CartItem) =>
  `${i.productId}-${i.size}-${[...i.toppings].sort().join(',')}`;

type CartState = {
  items: CartItem[];
  add: (i: CartItem) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  total: () => number;
  count: () => number;
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (i) =>
        set((s) => {
          const ex = s.items.find((x) => keyOf(x) === keyOf(i));
          return {
            items: ex
              ? s.items.map((x) =>
                  keyOf(x) === keyOf(i) ? { ...x, qty: x.qty + i.qty } : x,
                )
              : [...s.items, i],
          };
        }),
      setQty: (k, qty) =>
        set((s) => ({
          items: s.items.map((x) =>
            keyOf(x) === k ? { ...x, qty: Math.max(1, qty) } : x,
          ),
        })),
      remove: (k) => set((s) => ({ items: s.items.filter((x) => keyOf(x) !== k) })),
      clear: () => set({ items: [] }),
      total: () => get().items.reduce((sum, x) => sum + x.unitPrice * x.qty, 0),
      count: () => get().items.reduce((n, x) => n + x.qty, 0),
    }),
    { name: 'brewlite-cart' },
  ),
);

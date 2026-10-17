'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type CartSize = 'S' | 'M' | 'L';

export interface CartItem {
  productId: string;
  name: string;
  size: CartSize;
  toppings: string[];
  qty: number;
  /**
   * Giá 1 ly đã gồm: basePrice + phụ thu size + topping.
   * CHỈ dùng để hiển thị frontend.
   * Backend tuyệt đối không tin giá trị này.
   */
  unitPrice: number;
}

export interface CartState {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (productId: string, size: CartSize, toppings: string[]) => void;
  setQty: (
    productId: string,
    size: CartSize,
    toppings: string[],
    qty: number,
  ) => void;
  clear: () => void;
  total: () => number;
  count: () => number;
}

export function normalizeToppings(toppings: string[] = []): string[] {
  return [...new Set(toppings)].sort();
}

export function cartLineKey(item: {
  productId: string;
  size: CartSize;
  toppings: string[];
}): string {
  return [
    item.productId,
    item.size,
    normalizeToppings(item.toppings).join(','),
  ].join('|');
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      add: (incoming: CartItem) => {
        const cleanItem: CartItem = {
          ...incoming,
          toppings: normalizeToppings(incoming.toppings),
          qty: Math.min(99, Math.max(1, incoming.qty)),
        };

        set((state) => {
          const key = cartLineKey(cleanItem);
          const existing = state.items.find((item) => cartLineKey(item) === key);

          if (!existing) {
            return {
              items: [...state.items, cleanItem],
            };
          }

          return {
            items: state.items.map((item) =>
              cartLineKey(item) === key
                ? {
                    ...item,
                    qty: Math.min(99, item.qty + cleanItem.qty),
                  }
                : item,
            ),
          };
        });
      },

      remove: (productId: string, size: CartSize, toppings: string[]) => {
        const target = cartLineKey({ productId, size, toppings });
        set((state) => ({
          items: state.items.filter((item) => cartLineKey(item) !== target),
        }));
      },

      setQty: (
        productId: string,
        size: CartSize,
        toppings: string[],
        qty: number,
      ) => {
        const target = cartLineKey({ productId, size, toppings });
        const nextQty = Math.min(99, Math.max(1, Math.trunc(qty)));

        set((state) => ({
          items: state.items.map((item) =>
            cartLineKey(item) === target ? { ...item, qty: nextQty } : item,
          ),
        }));
      },

      clear: () => set({ items: [] }),

      total: () =>
        get().items.reduce(
          (sum, item) => sum + item.unitPrice * item.qty,
          0,
        ),

      count: () =>
        get().items.reduce((sum, item) => sum + item.qty, 0),
    }),
    {
      name: 'coffeeshop-cart-v1',
      version: 1,
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined') {
          return localStorage;
        }
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      partialize: (state) => ({
        items: state.items,
      }),
    },
  ),
);

// FIX 09 (C): Zustand chỉ lưu trạng thái; nghiệp vụ giỏ hàng nằm trong cart-rules.ts.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  cartCount, cartLineKey, cartTotal, clampCartQty, MAX_CART_QTY,
  mergeCartItems, sanitizeCartItem,
  type CartItem,
} from './cart-rules';

export type { CartItem } from './cart-rules';

export type CartState = {
  items: CartItem[];
  // Trả false khi dòng đã đạt 99 ly; UI không thông báo thêm thành công sai.
  add: (item: CartItem) => boolean;
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
      add: (input) => {
        const item = sanitizeCartItem(input);
        if (!item) throw new Error('Món thêm vào giỏ không hợp lệ');
        const key = cartLineKey(item);
        const current = get().items.find((line) => cartLineKey(line) === key);
        if (current && current.qty >= MAX_CART_QTY) return false;
        set((state) => ({ items: mergeCartItems([...state.items, item]) }));
        return true;
      },
      setQty: (key, qty) => {
        const safeQty = clampCartQty(qty);
        set((state) => ({
          items: state.items.map((item) =>
            cartLineKey(item) === key ? { ...item, qty: safeQty } : item),
        }));
      },
      remove: (key) => set((state) => ({
        items: state.items.filter((item) => cartLineKey(item) !== key),
      })),
      clear: () => set({ items: [] }),
      total: () => cartTotal(get().items),
      count: () => cartCount(get().items),
    }),
    {
      // Giữ nguyên key của FIX 01–08 để không làm mất giỏ hàng cũ sau khi cập nhật.
      name: 'brewlite-cart',
      partialize: (state) => ({ items: state.items }),
      // Kiểm tra và gộp lại dữ liệu cũ sau khi hydrate từ localStorage.
      merge: (persisted, current) => {
        const saved = persisted && typeof persisted === 'object' && 'items' in persisted
          ? (persisted as { items: unknown }).items
          : [];
        return { ...current, items: mergeCartItems(saved) };
      },
    },
  ),
);

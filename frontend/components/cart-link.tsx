'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { useCart } from '@/store/cart';

const emptySubscribe = () => () => {};

export function CartLink() {
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const count = useCart((s) => s.count());

  return (
    <Link
      href="/cart"
      className="hover:underline flex items-center gap-1.5"
      id="cart-header-link"
    >
      <span>🛒 Giỏ hàng</span>
      {isMounted && count > 0 && (
        <span
          className="bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded-full"
          id="cart-badge-count"
        >
          {count}
        </span>
      )}
    </Link>
  );
}

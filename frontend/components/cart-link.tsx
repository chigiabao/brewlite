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
      className="relative flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-900/30 hover:bg-amber-900/50 border border-amber-600/30 text-amber-100 hover:text-white transition duration-200 group"
      id="cart-header-link"
    >
      <svg
        className="w-4 h-4 text-amber-300 group-hover:scale-110 transition-transform"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
        />
      </svg>
      <span className="text-sm font-semibold">Giỏ hàng</span>
      {isMounted && count > 0 && (
        <span
          className="bg-amber-500 text-stone-950 text-xs font-black px-2 py-0.5 rounded-full shadow-sm"
          id="cart-badge-count"
        >
          {count}
        </span>
      )}
    </Link>
  );
}

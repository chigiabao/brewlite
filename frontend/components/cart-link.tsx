'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCartStore } from '@/store/cart';

export function CartLink() {
  const [mounted, setMounted] = useState(false);
  const count = useCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.qty, 0),
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Link
      href="/cart"
      className="cart-link-btn"
      id="cart-header-link"
    >
      <span className="cart-icon">🛒</span>
      <span>Giỏ hàng ({mounted ? count : 0})</span>
    </Link>
  );
}

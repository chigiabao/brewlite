'use client';

import Link from 'next/link';
import { useCartStore } from '@/store/cart';

function formatVnd(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(value);
}

export default function CartPage() {
  const items = useCartStore((state) => state.items);
  const setQty = useCartStore((state) => state.setQty);
  const remove = useCartStore((state) => state.remove);

  const total = items.reduce(
    (sum, item) => sum + item.unitPrice * item.qty,
    0,
  );

  if (items.length === 0) {
    return (
      <main className="cart-container empty-state">
        <div className="cart-card empty-card">
          <div className="empty-icon">☕</div>
          <h1>Giỏ hàng</h1>
          <p className="empty-text">Giỏ hàng đang trống.</p>
          <Link href="/" className="btn btn-primary back-link">
            Quay lại menu
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="cart-container">
      <div className="cart-header-row">
        <h1>Giỏ hàng</h1>
        <span className="items-count-badge">{items.length} món</span>
      </div>

      <div className="cart-content-grid">
        <div className="cart-items-list">
          {items.map((item) => {
            const itemKey = `${item.productId}-${item.size}-${[...item.toppings].sort().join(',')}`;
            return (
              <article key={itemKey} className="cart-item-card">
                <div className="item-details">
                  <div className="item-title-row">
                    <h2>{item.name}</h2>
                    <span className="size-badge">Size {item.size}</span>
                  </div>

                  <p className="item-meta">
                    <strong>Size: </strong>{item.size}
                  </p>
                  <p className="item-meta">
                    <strong>Topping: </strong>
                    {item.toppings.length > 0 ? item.toppings.join(', ') : 'Không'}
                  </p>
                  <p className="item-unit-price">
                    {formatVnd(item.unitPrice)} / ly
                  </p>
                </div>

                <div className="item-controls">
                  <div className="qty-picker">
                    <button
                      type="button"
                      className="qty-btn"
                      aria-label="Giảm số lượng"
                      disabled={item.qty <= 1}
                      onClick={() =>
                        setQty(
                          item.productId,
                          item.size,
                          item.toppings,
                          item.qty - 1,
                        )
                      }
                    >
                      -
                    </button>
                    <span className="qty-value">{item.qty}</span>
                    <button
                      type="button"
                      className="qty-btn"
                      aria-label="Tăng số lượng"
                      disabled={item.qty >= 99}
                      onClick={() =>
                        setQty(
                          item.productId,
                          item.size,
                          item.toppings,
                          item.qty + 1,
                        )
                      }
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn btn-delete"
                    onClick={() =>
                      remove(item.productId, item.size, item.toppings)
                    }
                  >
                    Xóa
                  </button>

                  <div className="line-total-wrapper">
                    <p className="line-total">
                      Thành tiền: {formatVnd(item.unitPrice * item.qty)}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="order-summary-card">
          <h2 className="summary-title">Tóm tắt đơn hàng</h2>
          <div className="summary-row">
            <span>Tạm tính</span>
            <span>{formatVnd(total)}</span>
          </div>
          <div className="summary-divider" />
          <div className="summary-row total-row">
            <strong>Tổng cộng: {formatVnd(total)}</strong>
          </div>
          <div className="checkout-action">
            <Link href="/checkout" className="btn btn-checkout">
              Thanh toán
            </Link>
            <Link href="/" className="link-continue-shopping">
              ← Tiếp tục chọn món
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}

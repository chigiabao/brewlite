'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useCartStore, type CartSize } from '@/store/cart';
import { calculateUnitPrice, SIZE_SURCHARGE, TOPPING_SURCHARGE } from '@/lib/pricing';

const PRODUCTS_MAP: Record<
  string,
  { id: string; name: string; price: number; description: string; image: string }
> = {
  'prod-1': {
    id: 'prod-1',
    name: 'Cappuccino',
    price: 35000,
    description: 'Espresso đậm vị phong cách Ý kết hợp với lớp bọt sữa tươi mềm mịn như lụa.',
    image: '☕',
  },
  'prod-2': {
    id: 'prod-2',
    name: 'Trà đào cam sả',
    price: 30000,
    description: 'Hương vị trà thanh mát cùng tinh chất cam sả sảng khoái và đào ngâm giòn rụm.',
    image: '🍑',
  },
  'prod-3': {
    id: 'prod-3',
    name: 'Caramel Macchiato',
    price: 45000,
    description: 'Cà phê nguyên chất đượm đà hòa chút vị ngọt béo của caramel thượng hạng.',
    image: '🍯',
  },
  'prod-4': {
    id: 'prod-4',
    name: 'Matcha Latte',
    price: 40000,
    description: 'Trà xanh Uji Nhật Bản nồng nàn thơm ngát cùng sữa tươi béo ngậy.',
    image: '🍵',
  },
};

const AVAILABLE_TOPPINGS = [
  { id: 'CREAM', label: 'Kem Macchiato (+5.000đ)' },
  { id: 'PEARL', label: 'Trân châu trắng (+5.000đ)' },
  { id: 'JELLY', label: 'Thạch cà phê (+5.000đ)' },
];

function formatVnd(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(value);
}

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const product = PRODUCTS_MAP[id] || {
    id,
    name: 'Cà phê CoffeeShop',
    price: 35000,
    description: 'Sản phẩm cà phê đặc trưng của quán.',
    image: '☕',
  };

  const [size, setSize] = useState<CartSize>('M');
  const [toppings, setToppings] = useState<string[]>([]);
  const [qty, setQty] = useState<number>(1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const add = useCartStore((state) => state.add);

  const unitPrice = calculateUnitPrice(product.price, size, toppings);
  const lineTotal = unitPrice * qty;

  const toggleTopping = (toppingId: string) => {
    setToppings((prev) =>
      prev.includes(toppingId)
        ? prev.filter((t) => t !== toppingId)
        : [...prev, toppingId],
    );
  };

  const handleAddToCart = () => {
    // Contract according to GUIDE-V2 C
    add({
      productId: product.id,
      name: product.name,
      size,
      toppings,
      qty,
      unitPrice,
    });

    setToastMessage(`Đã thêm ${qty} ${product.name} (Size ${size}) vào giỏ hàng!`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <Link href="/" style={{ color: '#8b4513', textDecoration: 'none', fontWeight: 600 }}>
        ← Quay lại thực đơn
      </Link>

      {toastMessage && (
        <div
          style={{
            margin: '1rem 0',
            padding: '1rem',
            backgroundColor: '#dcfce7',
            color: '#166534',
            borderRadius: '8px',
            border: '1px solid #bbf7d0',
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>✓ {toastMessage}</span>
          <Link
            href="/cart"
            style={{
              backgroundColor: '#16a34a',
              color: '#fff',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '0.85rem',
            }}
          >
            Xem giỏ ngay
          </Link>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          gap: '2.5rem',
          backgroundColor: '#fff',
          padding: '2rem',
          borderRadius: '16px',
          border: '1px solid #e7e5e4',
          marginTop: '1.5rem',
        }}
      >
        <div
          style={{
            backgroundColor: '#fef7ed',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '6rem',
            minHeight: '280px',
          }}
        >
          {product.image}
        </div>

        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#292524', marginBottom: '0.5rem' }}>
            {product.name}
          </h1>
          <p style={{ color: '#78716c', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
            {product.description}
          </p>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>
              Chọn Kích Thước (Size)
            </label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {(['S', 'M', 'L'] as CartSize[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  style={{
                    flex: 1,
                    padding: '0.6rem 0.5rem',
                    borderRadius: '8px',
                    border: size === s ? '2px solid #8b4513' : '1px solid #d6d3d1',
                    backgroundColor: size === s ? '#fef7ed' : '#fff',
                    color: size === s ? '#8b4513' : '#44403c',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Size {s} {SIZE_SURCHARGE[s] > 0 ? `(+${SIZE_SURCHARGE[s] / 1000}k)` : ''}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>
              Thêm Topping (+{TOPPING_SURCHARGE / 1000}k mỗi loại)
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {AVAILABLE_TOPPINGS.map((top) => (
                <label
                  key={top.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={toppings.includes(top.id)}
                    onChange={() => toggleTopping(top.id)}
                    style={{ width: '18px', height: '18px', accentColor: '#8b4513' }}
                  />
                  <span>{top.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>
              Số Lượng
            </label>
            <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #d6d3d1', borderRadius: '8px' }}>
              <button
                type="button"
                disabled={qty <= 1}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                style={{ width: '36px', height: '36px', border: 'none', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                -
              </button>
              <span style={{ padding: '0 1rem', fontWeight: 700 }}>{qty}</span>
              <button
                type="button"
                disabled={qty >= 99}
                onClick={() => setQty((q) => Math.min(99, q + 1))}
                style={{ width: '36px', height: '36px', border: 'none', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                +
              </button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e7e5e4', paddingTop: '1.25rem', marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
              <span style={{ color: '#78716c', fontWeight: 500 }}>Đơn giá: {formatVnd(unitPrice)}/ly</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#8b4513' }}>
                Tổng: {formatVnd(lineTotal)}
              </span>
            </div>

            <button
              type="button"
              id="add-to-cart-button"
              className="btn btn-primary"
              onClick={handleAddToCart}
              style={{ width: '100%', padding: '0.85rem' }}
            >
              Thêm vào giỏ hàng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

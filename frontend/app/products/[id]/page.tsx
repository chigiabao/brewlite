'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { getProduct } from '@/lib/products-api';
import { Size, calculateUnitPrice } from '@/lib/pricing';
import { useCart } from '@/store/cart';

const ALLOWED_TOPPINGS = ['Trân châu', 'Kem'] as const;

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300' fill='%23F3F4F6'><rect width='400' height='300' fill='%23F3F4F6'/><path d='M160 110h80v70a40 40 0 0 1-40 40 40 40 0 0 1-40-40v-70Z' stroke='%239CA3AF' stroke-width='6' fill='%23E5E7EB'/><path d='M240 130h16a16 16 0 0 1 16 16v8a16 16 0 0 1-16 16h-16' stroke='%239CA3AF' stroke-width='6' fill='none'/><path d='M175 85c0-10 10-15 10-25M200 85c0-10 10-15 10-25M225 85c0-10 10-15 10-25' stroke='%23D1D5DB' stroke-width='4' stroke-linecap='round'/><text x='50%25' y='260' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%239CA3AF' font-weight='600'>BrewLite Coffee</text></svg>";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const {
    data: product,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['products', id],
    queryFn: () => getProduct(id!),
    enabled: !!id,
  });

  const [size, setSize] = useState<Size>('S');
  const [toppings, setToppings] = useState<string[]>([]);
  const [showToast, setShowToast] = useState(false);

  const add = useCart((state) => state.add);

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    return calculateUnitPrice(product.price, size, toppings);
  }, [product, size, toppings]);

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-gray-600 font-medium">Đang tải sản phẩm...</p>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-red-600 font-semibold mb-4">Không tải được thông tin sản phẩm</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-4 py-2 bg-amber-700 text-white rounded-md hover:bg-amber-800 transition mb-4"
        >
          Thử lại
        </button>
        <Link href="/" className="text-sm text-amber-700 hover:underline">
          ← Quay lại Menu
        </Link>
      </div>
    );
  }

  const toggleTopping = (topping: string) => {
    setToppings((prev) =>
      prev.includes(topping) ? prev.filter((item) => item !== topping) : [...prev, topping],
    );
  };

  const handleAddToCart = () => {
    if (product.stock <= 0) return;

    add({
      productId: product.id,
      name: product.name,
      size,
      toppings,
      unitPrice,
      qty: 1,
    });

    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 2500);
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-xl shadow-md border border-gray-100 my-8">
      {/* Toast thông báo thành công */}
      {showToast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 transition duration-300">
          <span>✓</span>
          <span>Đã thêm <strong>{product.name}</strong> vào giỏ hàng!</span>
        </div>
      )}

      <div className="relative mb-4">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="h-56 w-full object-cover rounded-lg bg-gray-200"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = PLACEHOLDER_IMG;
          }}
        />
        {product.stock <= 0 && (
          <span className="absolute top-3 right-3 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded">
            Hết hàng
          </span>
        )}
      </div>

      <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
      <p className="text-2xl font-extrabold text-amber-700 mt-2">
        {unitPrice.toLocaleString('vi-VN')}đ
      </p>

      {/* Chọn Size */}
      <div className="mt-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Chọn Size</label>
        <div className="flex gap-3">
          {(['S', 'M', 'L'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition ${
                size === s
                  ? 'border-amber-700 bg-amber-700 text-white shadow-sm'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {s} {s === 'M' ? '(+5k)' : s === 'L' ? '(+10k)' : '(+0k)'}
            </button>
          ))}
        </div>
      </div>

      {/* Chọn Topping */}
      <div className="mt-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Chọn Topping (+5.000đ/loại)
        </label>
        <div className="flex gap-2 flex-wrap">
          {ALLOWED_TOPPINGS.map((topping) => (
            <button
              key={topping}
              type="button"
              onClick={() => toggleTopping(topping)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                toppings.includes(topping)
                  ? 'border-amber-700 bg-amber-50 text-amber-800 font-semibold'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {toppings.includes(topping) ? '✓ ' : '+ '}
              {topping}
            </button>
          ))}
        </div>
      </div>

      {/* Nút Thêm vào giỏ */}
      <button
        type="button"
        disabled={product.stock <= 0}
        onClick={handleAddToCart}
        className={`mt-8 w-full py-3 rounded-lg font-bold text-base transition shadow-sm ${
          product.stock <= 0
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-amber-700 hover:bg-amber-800 text-white active:scale-[0.99]'
        }`}
      >
        {product.stock <= 0 ? 'Hết hàng' : 'Thêm vào giỏ hàng'}
      </button>

      <div className="mt-4 text-center">
        <Link href="/" className="text-sm text-gray-500 hover:text-amber-800 transition">
          ← Tiếp tục chọn đồ uống
        </Link>
      </div>
    </div>
  );
}

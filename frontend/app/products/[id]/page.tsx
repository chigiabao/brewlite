'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { getProduct, ProductNotFoundError } from '@/lib/products-api';
import { Size, calculateUnitPrice } from '@/lib/pricing';
import { useCart } from '@/store/cart';
import { ALLOWED_CART_TOPPINGS } from '@/store/cart-rules';

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300' fill='%23F3F4F6'><rect width='400' height='300' fill='%23F3F4F6'/><path d='M160 110h80v70a40 40 0 0 1-40 40 40 40 0 0 1-40-40v-70Z' stroke='%239CA3AF' stroke-width='6' fill='%23E5E7EB'/><path d='M240 130h16a16 16 0 0 1 16 16v8a16 16 0 0 1-16 16h-16' stroke='%239CA3AF' stroke-width='6' fill='none'/><path d='M175 85c0-10 10-15 10-25M200 85c0-10 10-15 10-25M225 85c0-10 10-15 10-25' stroke='%23D1D5DB' stroke-width='4' stroke-linecap='round'/><text x='50%25' y='260' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%239CA3AF' font-weight='600'>BrewLite Coffee</text></svg>";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const {
    data: product,
    isPending,
    isError,
    error: productError,
    refetch,
  } = useQuery({
    queryKey: ['products', id],
    queryFn: () => getProduct(id!),
    enabled: !!id,
  });

  const [size, setSize] = useState<Size>('S');
  const [toppings, setToppings] = useState<string[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [cartError, setCartError] = useState('');

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
        <p className="text-red-600 font-semibold mb-4">{productError instanceof ProductNotFoundError ? 'Sản phẩm không tồn tại' : 'Không tải được thông tin sản phẩm'}</p>
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

    try {
      const added = add({
        productId: product.id,
        name: product.name,
        size,
        toppings,
        unitPrice,
        qty: 1,
      });
      if (!added) {
        setCartError('Món này đã đạt giới hạn 99 ly trong giỏ hàng.');
        setShowToast(false);
        return;
      }
    } catch {
      setCartError('Không thể thêm món vào giỏ. Hãy kiểm tra dữ liệu sản phẩm.');
      return;
    }
    setCartError('');
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 2500);
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-stone-500 mb-6 font-medium">
        <Link href="/" className="hover:text-amber-800 transition">
          Trang chủ
        </Link>
        <span>/</span>
        <Link href="/#menu" className="hover:text-amber-800 transition">
          Thực đơn
        </Link>
        <span>/</span>
        <span className="text-stone-900 font-bold truncate max-w-[180px]">{product.name}</span>
      </nav>

      {/* Main Product Card */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-xl border border-stone-200/90">
        {/* Toast thông báo thành công */}
        {showToast && (
          <div className="fixed top-6 right-6 z-50 bg-stone-900/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border border-amber-500/40 flex items-center gap-3 transition duration-300">
            <span className="w-6 h-6 rounded-full bg-emerald-500 text-stone-950 flex items-center justify-center text-xs font-black">
              ✓
            </span>
            <span className="text-sm font-medium">
              Đã thêm <strong>{product.name}</strong> vào giỏ hàng!
            </span>
          </div>
        )}

        <div className="relative mb-6 rounded-2xl overflow-hidden bg-stone-100 aspect-16/10 shadow-inner">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = PLACEHOLDER_IMG;
            }}
          />
          {product.badge && (
            <span className="absolute top-3 left-3 bg-amber-500 text-stone-950 text-xs font-black px-3 py-1 rounded-full shadow">
              {product.badge}
            </span>
          )}
          {product.stock <= 0 && (
            <span className="absolute top-3 right-3 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">
              Hết hàng
            </span>
          )}
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
              {product.name}
            </h1>
            {product.description && (
              <p className="text-sm text-stone-500 mt-2 leading-relaxed">
                {product.description}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl sm:text-3xl font-black text-amber-800">
              {unitPrice.toLocaleString('vi-VN')}đ
            </p>
            <span className="text-xs text-stone-400 font-medium">Giá đã gồm thuế</span>
          </div>
        </div>

        {/* Chọn Size */}
        <div className="mt-8 pt-6 border-t border-stone-100">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-bold text-stone-800">Chọn Size ly</label>
            <span className="text-xs text-stone-400">Đang chọn: Size {size}</span>
          </div>
          <div className="flex gap-3">
            {(['S', 'M', 'L'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className={`flex-1 py-3 text-sm font-bold rounded-xl border transition-all ${
                  size === s
                    ? 'border-amber-800 bg-amber-800 text-white shadow-md shadow-amber-900/20 scale-[1.02]'
                    : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                }`}
              >
                {s} {s === 'M' ? '(+5k)' : s === 'L' ? '(+10k)' : '(+0k)'}
              </button>
            ))}
          </div>
        </div>

        {/* Chọn Topping */}
        <div className="mt-6 pt-6 border-t border-stone-100">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-bold text-stone-800">Thêm Topping</label>
            <span className="text-xs text-amber-700 font-semibold">+5.000đ/loại</span>
          </div>
          <div className="flex gap-2.5 flex-wrap">
            {ALLOWED_CART_TOPPINGS.map((topping) => {
              const selected = toppings.includes(topping);
              return (
                <button
                  key={topping}
                  type="button"
                  onClick={() => toggleTopping(topping)}
                  className={`px-4 py-2 text-sm rounded-xl border font-semibold transition-all ${
                    selected
                      ? 'border-amber-800 bg-amber-100/70 text-amber-900'
                      : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {selected ? '✓ ' : '+ '}
                  {topping}
                </button>
              );
            })}
          </div>
        </div>

        {cartError && <p role="alert" className="mt-5 text-sm font-semibold text-red-700">{cartError}</p>}

        {/* Nút Thêm vào giỏ */}
        <button
          type="button"
          disabled={product.stock <= 0}
          onClick={handleAddToCart}
          className={`mt-8 w-full py-4 rounded-xl font-black text-base transition-all shadow-lg flex items-center justify-center gap-2 ${
            product.stock <= 0
              ? 'bg-stone-200 text-stone-400 cursor-not-allowed shadow-none'
              : 'bg-gradient-to-r from-amber-700 to-amber-800 hover:from-amber-800 hover:to-amber-900 text-white shadow-amber-900/30 hover:scale-[1.01] active:scale-[0.99]'
          }`}
        >
          <span>🛒</span>
          <span>{product.stock <= 0 ? 'Món Này Tạm Hết Hàng' : 'Thêm Vào Giỏ Hàng'}</span>
        </button>

        <div className="mt-6 text-center">
          <Link
            href="/#menu"
            className="text-xs font-bold text-stone-500 hover:text-amber-800 transition"
          >
            ← Tiếp tục chọn món khác
          </Link>
        </div>
      </div>
    </div>
  );
}

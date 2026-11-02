// Trang giỏ hàng. Người phụ trách: C (Task 5).
'use client';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { useCart } from '@/store/cart';
import { cartLineKey, MAX_CART_QTY } from '@/store/cart-rules';

// Chờ Zustand đọc xong localStorage để tránh chớp giao diện 'Giỏ trống' khi refresh.
const onHydrated = (callback: () => void) => useCart.persist.onFinishHydration(callback);
const isHydrated = () => useCart.persist.hasHydrated();
const isHydratedOnServer = () => false;

export default function CartPage() {
  const hydrated = useSyncExternalStore(onHydrated, isHydrated, isHydratedOnServer);
  const items = useCart((s) => s.items);
  const total = useCart((s) => s.total());
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);


  if (!hydrated) {
    return <div className="max-w-xl mx-auto py-16 text-center text-stone-600">Đang tải giỏ hàng...</div>;
  }

  if (!items.length) {
    return (
      <div className="max-w-lg mx-auto bg-white p-10 rounded-3xl shadow-xl border border-stone-200/90 text-center my-12 space-y-4">
        <div className="w-20 h-20 mx-auto rounded-full bg-amber-100/80 flex items-center justify-center text-3xl">
          ☕
        </div>
        <h2 className="text-xl font-extrabold text-stone-900">Giỏ hàng của bạn đang trống</h2>
        <p className="text-xs text-stone-500 max-w-xs mx-auto">
          Chưa có món đồ uống thơm ngon nào được chọn. Hãy ghé menu để lựa chọn món bạn thích nhé!
        </p>
        <Link
          href="/#menu"
          className="inline-block mt-2 px-6 py-3 rounded-xl font-bold text-xs bg-amber-800 hover:bg-amber-900 text-white shadow-lg shadow-amber-900/20 transition-all hover:scale-[1.02]"
        >
          Khám Phá Menu Ngay →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-stone-500 mb-6 font-medium">
        <Link href="/" className="hover:text-amber-800 transition">
          Trang chủ
        </Link>
        <span>/</span>
        <span className="text-stone-900 font-bold">Giỏ hàng ({items.length} món)</span>
      </nav>

      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-xl border border-stone-200/90">
        <div className="flex items-center justify-between pb-4 border-b border-stone-100">
          <h1 className="text-2xl font-black text-stone-900">Giỏ Hàng Của Bạn</h1>
          <span className="text-xs font-semibold px-2.5 py-1 bg-amber-100 text-amber-900 rounded-full">
            Đơn hàng BrewLite
          </span>
        </div>

        <ul className="divide-y divide-stone-100 mt-2">
          {items.map((item) => {
            const k = cartLineKey(item);
            return (
              <li key={k} className="py-4 flex justify-between items-center gap-4">
                <div className="space-y-0.5">
                  <div className="font-bold text-stone-900 text-base">{item.name}</div>
                  <div className="text-xs text-stone-500 font-medium">
                    Size: <span className="font-bold text-stone-700">{item.size}</span>
                    {item.toppings.length > 0 && ` • Topping: ${item.toppings.join(', ')}`}
                  </div>
                  <div className="text-amber-800 font-extrabold text-sm pt-0.5">
                    {item.unitPrice.toLocaleString('vi-VN')}đ
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center border border-stone-200 rounded-xl overflow-hidden bg-stone-50">
                    <button
                      type="button"
                      onClick={() => setQty(k, item.qty - 1)}
                      disabled={item.qty <= 1}
                      className="w-8 h-8 flex items-center justify-center hover:bg-stone-200 disabled:opacity-30 disabled:cursor-not-allowed text-stone-700 font-bold transition"
                      aria-label="Giảm số lượng"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-xs font-black text-stone-900">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty(k, item.qty + 1)}
                      disabled={item.qty >= MAX_CART_QTY}
                      className="w-8 h-8 flex items-center justify-center hover:bg-stone-200 disabled:opacity-30 disabled:cursor-not-allowed text-stone-700 font-bold transition"
                      aria-label="Tăng số lượng"
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => remove(k)}
                    className="p-1.5 text-stone-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition"
                    title="Xóa món này"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Total & Checkout */}
        <div className="border-t border-stone-200/80 pt-5 mt-4 space-y-3">
          <div className="flex justify-between items-center text-sm text-stone-500">
            <span>Tạm tính ({items.reduce((acc, i) => acc + i.qty, 0)} ly)</span>
            <span>{total.toLocaleString('vi-VN')}đ</span>
          </div>
          <div className="flex justify-between items-center text-sm text-emerald-600 font-semibold">
            <span>Phí giao hàng</span>
            <span>Miễn phí (Ưu đãi)</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-stone-100">
            <span className="font-extrabold text-base text-stone-900">Tổng thanh toán</span>
            <span className="font-black text-2xl text-amber-800">
              {total.toLocaleString('vi-VN')}đ
            </span>
          </div>

          <Link
            href="/checkout"
            className="block w-full py-4 rounded-xl text-center font-black text-base bg-gradient-to-r from-amber-700 to-amber-800 hover:from-amber-800 hover:to-amber-900 text-white shadow-lg shadow-amber-900/30 hover:scale-[1.01] active:scale-[0.99] transition-all mt-4"
          >
            Tiến Hành Đặt Hàng →
          </Link>

          <div className="text-center pt-2">
            <Link href="/#menu" className="text-xs font-bold text-stone-500 hover:text-amber-800 transition">
              ← Tiếp tục chọn thêm đồ uống
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Trang giỏ hàng. Người phụ trách: C (Task 5).
'use client';
import Link from 'next/link';
import { useCart } from '@/store/cart';

export default function CartPage() {
  const items = useCart((s) => s.items);
  const total = useCart((s) => s.total());
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);

  const keyOf = (i: (typeof items)[0]) =>
    `${i.productId}-${i.size}-${[...i.toppings].sort().join(',')}`;

  if (!items.length) {
    return (
      <div className="text-center py-8">
        <p>Giỏ hàng trống.</p>
        <Link href="/" className="text-amber-700 underline">
          Xem menu
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto bg-white p-6 rounded-lg shadow">
      <h1 className="text-xl font-bold mb-4">Giỏ hàng</h1>
      <ul className="divide-y">
        {items.map((item) => {
          const k = keyOf(item);
          return (
            <li key={k} className="py-3 flex justify-between items-center">
              <div>
                <div className="font-semibold">{item.name}</div>
                <div className="text-sm text-gray-500">
                  Size {item.size}
                  {item.toppings.length > 0 && ` · ${item.toppings.join(', ')}`}
                </div>
                <div className="text-amber-700">
                  {item.unitPrice.toLocaleString('vi-VN')}đ
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQty(k, item.qty - 1)}
                  className="w-8 h-8 border rounded"
                >
                  −
                </button>
                <span>{item.qty}</span>
                <button
                  onClick={() => setQty(k, item.qty + 1)}
                  className="w-8 h-8 border rounded"
                >
                  +
                </button>
                <button onClick={() => remove(k)} className="text-red-500 ml-2">
                  Xóa
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="border-t pt-4 mt-4 flex justify-between font-bold">
        <span>Tổng cộng</span>
        <span className="text-amber-700">{total.toLocaleString('vi-VN')}đ</span>
      </div>
      <Link
        href="/checkout"
        className="block mt-4 text-center bg-amber-600 text-white py-2 rounded hover:bg-amber-700"
      >
        Thanh toán
      </Link>
    </div>
  );
}

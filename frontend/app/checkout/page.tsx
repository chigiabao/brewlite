// Trang thanh toán. Người phụ trách: F (Task 8).
'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useCart } from '@/store/cart';

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const total = useCart((s) => s.total());
  const clear = useCart((s) => s.clear);

  const [method, setMethod] = useState<'WALLET' | 'CARD'>('WALLET');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Một khóa cho một lần thanh toán; bấm thử lại giữ nguyên khóa (Task 10 – F).
  const idemKey = useRef<string | null>(null);
  // Giữ orderId trong cùng phiên trang checkout. Retry không được POST /orders lần nữa.
  // Khi reload, người dùng cần mở lịch sử đơn để kiểm tra trước khi tạo lại.
  const pendingOrder = useRef<{ id: number; cartKey: string } | null>(null);

  useEffect(() => {
    if (!items.length) router.replace('/cart');
  }, [items.length, router]);

  if (!items.length) return null;

  const handlePay = async () => {
    const cartKey = JSON.stringify(items.map(({ productId, size, toppings, qty }) => ({
      productId, size, toppings: [...toppings].sort(), qty,
    })));
    // Không dùng nhầm đơn cũ nếu giỏ đã thay đổi trong khi checkout.
    if (pendingOrder.current && pendingOrder.current.cartKey !== cartKey) {
      pendingOrder.current = null;
      idemKey.current = null;
    }
    idemKey.current ??= crypto.randomUUID();
    setLoading(true);
    setError('');
    try {
      // E: chỉ tạo đơn 1 lần cho một giỏ. Server vẫn phải tự tính lại giá.
      if (!pendingOrder.current) {
        const order = await api<{ id: number }>('/orders', {
          method: 'POST',
          body: JSON.stringify({
            items: items.map(({ productId, size, toppings, qty }) => ({
              productId, size, toppings, qty,
            })),
          }),
        });
        pendingOrder.current = { id: order.id, cartKey };
      }

      // Sau await, tránh phụ thuộc vào narrowing của ref mutable.
      const orderId = pendingOrder.current?.id;
      if (!orderId) throw new Error('Không tạo được đơn hàng. Vui lòng kiểm tra lịch sử đơn.');

      // TODO(F – Task 8): gọi POST /payments
      const res = await api<{ orderId: number; status: string }>('/payments', {
        method: 'POST',
        headers: { 'Idempotency-Key': idemKey.current },
        body: JSON.stringify({ orderId, method }),
      });

      if (res.status === 'PAID') {
        clear();
        router.push(`/orders/${res.orderId}/confirmed`);
      } else {
        // Kết quả lỗi đã rõ: lần thanh toán tiếp theo cần key mới, nhưng giữ orderId.
        idemKey.current = null;
        setError('Thanh toán lỗi. Giỏ hàng vẫn được giữ. Vui lòng thử lại.');
      }
    } catch (e: unknown) {
      // Kết quả không rõ (timeout/mất mạng): giữ key để thử lại cùng attempt.
      setError((e as Error).message ?? 'Đã xảy ra lỗi. Kiểm tra lịch sử đơn trước khi tạo lần khác.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow">
      <h1 className="text-xl font-bold mb-4">Thanh toán</h1>
      <p className="text-lg">
        Tổng: <span className="text-amber-700 font-bold">{total.toLocaleString('vi-VN')}đ</span>
      </p>

      <div className="mt-4">
        <div className="font-semibold mb-2">Phương thức</div>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={method === 'WALLET'}
            onChange={() => { if (!idemKey.current) setMethod('WALLET'); }}
          />
          Ví điện tử
        </label>
        <label className="flex items-center gap-2 mt-1">
          <input
            type="radio"
            checked={method === 'CARD'}
            onChange={() => { if (!idemKey.current) setMethod('CARD'); }}
          />
          Thẻ ngân hàng
        </label>
      </div>

      {error && <p className="text-red-600 mt-4">{error}</p>}

      <button
        onClick={handlePay}
        disabled={loading}
        className="mt-6 w-full bg-amber-600 text-white py-2 rounded hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? 'Đang xử lý…' : 'Xác nhận thanh toán'}
      </button>
    </div>
  );
}

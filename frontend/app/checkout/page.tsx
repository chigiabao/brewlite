// Trang thanh toán. Người phụ trách: F (Task 8) + G (coupon/loyalty integration).
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useCart } from '@/store/cart';

type CouponQuote = { valid: true; discount: number };
type RewardsBalance = { loyaltyPoints: number };
type OrderSummary = {
  id: number;
  status: string;
  subtotal: number;
  discountTotal: number;
  pointsRedeemed: number;
  total: number;
};
type PaymentResult = {
  orderId: number;
  status: string;
  orderStatus: string;
};

const money = (value: number) => `${value.toLocaleString('vi-VN')}đ`;

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const cartSubtotal = useCart((s) => s.total());
  const clear = useCart((s) => s.clear);

  const [method, setMethod] = useState<'WALLET' | 'CARD'>('WALLET');
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [loyaltyPoints, setLoyaltyPoints] = useState<number | null>(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Một khóa cho một lần thanh toán; retry payment giữ nguyên key khi kết quả không rõ.
  const idemKey = useRef<string | null>(null);
  // Giữ orderId trong cùng phiên checkout, không reserve rewards lần hai khi retry payment.
  const pendingOrder = useRef<{ id: number; cartKey: string } | null>(null);

  const cartKey = JSON.stringify(items.map(({ productId, size, toppings, qty }) => ({
    productId,
    size,
    toppings: [...toppings].sort(),
    qty,
  })));

  useEffect(() => {
    if (!items.length) router.replace('/cart');
  }, [items.length, router]);

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('token');
    if (!token) return () => { active = false; };

    api<RewardsBalance>('/rewards/me')
      .then((balance) => {
        if (active) setLoyaltyPoints(balance.loyaltyPoints);
      })
      .catch(() => {
        // Auth/session errors are shown as a disabled points control. Coupon checkout remains usable.
        if (active) setLoyaltyPoints(null);
      });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (pendingOrder.current?.cartKey === cartKey) return;
    if (pendingOrder.current) {
      pendingOrder.current = null;
      idemKey.current = null;
      setOrderSummary(null);
    }
    setCouponDiscount(0);
    setCouponError('');
  }, [cartKey]);

  if (!items.length) return null;

  const pointsPreview = Math.min(
    Math.max(0, pointsToRedeem),
    Math.max(0, cartSubtotal - couponDiscount),
  );
  const previewTotal = cartSubtotal - couponDiscount - pointsPreview;
  const orderLocked = orderSummary !== null;
  const shownSubtotal = orderSummary?.subtotal ?? cartSubtotal;
  const shownPoints = orderSummary?.pointsRedeemed ?? pointsPreview;
  const shownDiscount = orderSummary?.discountTotal ?? couponDiscount + pointsPreview;
  const shownCouponDiscount = orderSummary
    ? Math.max(0, shownDiscount - shownPoints)
    : couponDiscount;
  const shownTotal = orderSummary?.total ?? previewTotal;

  const handleApplyCoupon = async () => {
    const normalizedCode = couponCode.trim().toUpperCase();
    setCouponCode(normalizedCode);
    setCouponError('');
    if (!normalizedCode) {
      setCouponDiscount(0);
      return;
    }

    setCouponLoading(true);
    try {
      const quote = await api<CouponQuote>('/coupons/validate', {
        method: 'POST',
        body: JSON.stringify({ code: normalizedCode, orderTotal: cartSubtotal }),
      });
      setCouponDiscount(quote.discount);
    } catch (e: unknown) {
      setCouponDiscount(0);
      setCouponError((e as Error).message ?? 'Mã giảm giá không hợp lệ.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handlePay = async () => {
    // Không dùng nhầm đơn cũ nếu giỏ đã thay đổi trong khi checkout.
    if (pendingOrder.current && pendingOrder.current.cartKey !== cartKey) {
      pendingOrder.current = null;
      idemKey.current = null;
      setOrderSummary(null);
    }

    idemKey.current ??= crypto.randomUUID();
    setLoading(true);
    setError('');
    try {
      if (!pendingOrder.current) {
        const order = await api<OrderSummary>('/orders', {
          method: 'POST',
          body: JSON.stringify({
            items: items.map(({ productId, size, toppings, qty }) => ({
              productId,
              size,
              toppings,
              qty,
            })),
            couponCode: couponCode.trim().toUpperCase() || undefined,
            pointsToRedeem: pointsToRedeem > 0 ? pointsToRedeem : undefined,
          }),
        });
        // Tổng tiền authoritative là snapshot từ backend, không phải cart.total().
        setOrderSummary(order);
        pendingOrder.current = { id: order.id, cartKey };
      }

      const orderId = pendingOrder.current?.id;
      if (!orderId) throw new Error('Không tạo được đơn hàng. Vui lòng thử lại.');

      const res = await api<PaymentResult>('/payments', {
        method: 'POST',
        headers: { 'Idempotency-Key': idemKey.current },
        body: JSON.stringify({ orderId, method }),
      });

      if (res.orderStatus === 'PAID' || res.status === 'PAID') {
        if (localStorage.getItem('token')) {
          await api<RewardsBalance>('/rewards/me')
            .then((balance) => setLoyaltyPoints(balance.loyaltyPoints))
            .catch(() => undefined);
        }
        clear();
        router.push(`/orders/${res.orderId}/confirmed`);
      } else {
        // Payment failed: order/reward reservation stays available for another payment attempt.
        idemKey.current = null;
        setError('Thanh toán lỗi. Điểm và coupon đã giữ theo đơn; vui lòng thử lại.');
      }
    } catch (e: unknown) {
      // HTTP failure từ gateway đã đổi order sang PAYMENT_FAILED: payment retry
      // phải có key mới. Network failure không có status thì giữ key để replay an toàn.
      if (
        pendingOrder.current &&
        e instanceof ApiError &&
        [402, 500, 504].includes(e.status)
      ) {
        idemKey.current = null;
      }
      setError((e as Error).message ?? 'Đã xảy ra lỗi. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow space-y-5">
      <div>
        <h1 className="text-xl font-bold">Thanh toán</h1>
        <p className="text-sm text-gray-500 mt-1">
          Coupon và điểm chỉ được giữ khi tạo đơn thành công.
        </p>
      </div>

      <section className="space-y-2">
        <label htmlFor="coupon" className="font-semibold block">Mã giảm giá</label>
        <div className="flex gap-2">
          <input
            id="coupon"
            value={couponCode}
            onChange={(event) => {
              setCouponCode(event.target.value);
              setCouponDiscount(0);
              setCouponError('');
            }}
            disabled={loading || orderLocked}
            placeholder="Ví dụ: GIAM10"
            className="min-w-0 flex-1 border rounded px-3 py-2 uppercase"
          />
          <button
            type="button"
            onClick={handleApplyCoupon}
            disabled={couponLoading || loading || orderLocked}
            className="bg-gray-800 text-white px-3 rounded disabled:opacity-50"
          >
            {couponLoading ? 'Đang kiểm tra…' : 'Áp dụng'}
          </button>
        </div>
        {couponDiscount > 0 && !couponError && (
          <p className="text-green-700 text-sm">Giảm {money(couponDiscount)}</p>
        )}
        {couponError && <p className="text-red-600 text-sm">{couponError}</p>}
      </section>

      <section className="space-y-2">
        <label htmlFor="points" className="font-semibold block">Dùng loyalty points</label>
        <p className="text-sm text-gray-600">
          {loyaltyPoints === null
            ? 'Đăng nhập để xem và sử dụng điểm.'
            : `Số dư hiện tại: ${loyaltyPoints.toLocaleString('vi-VN')} điểm`}
        </p>
        <input
          id="points"
          type="number"
          min={0}
          max={loyaltyPoints ?? undefined}
          step={1}
          value={pointsToRedeem}
          onChange={(event) => setPointsToRedeem(Math.max(0, Number(event.target.value) || 0))}
          disabled={loading || orderLocked || loyaltyPoints === null}
          className="w-full border rounded px-3 py-2"
        />
      </section>

      <section className="border-t pt-4 space-y-1">
        <div className="flex justify-between">
          <span>Tạm tính</span>
          <span>{money(shownSubtotal)}</span>
        </div>
        {shownCouponDiscount > 0 && (
          <div className="flex justify-between text-green-700">
            <span>Coupon {couponCode || 'giảm giá'}</span>
            <span>-{money(shownCouponDiscount)}</span>
          </div>
        )}
        {shownPoints > 0 && (
          <div className="flex justify-between text-green-700">
            <span>Điểm sử dụng</span>
            <span>-{money(shownPoints)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-2 text-lg font-bold">
          <span>Thanh toán</span>
          <span className="text-amber-700">{money(shownTotal)}</span>
        </div>
        {orderSummary && (
          <p className="text-xs text-gray-500">Tổng tiền đã được server xác nhận cho đơn #{orderSummary.id}.</p>
        )}
      </section>

      <section>
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
      </section>

      {error && <p className="text-red-600">{error}</p>}

      <button
        onClick={handlePay}
        disabled={loading || couponLoading}
        className="w-full bg-amber-600 text-white py-2 rounded hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? 'Đang xử lý…' : 'Xác nhận thanh toán'}
      </button>
    </div>
  );
}

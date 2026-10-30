// Trang thanh toán hoàn chỉnh. Người phụ trách: F (Task 8 UI) & E (Tạo đơn) & G (Khuyến mãi).
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useCart } from '@/store/cart';
import {
  CheckoutApiError,
  createCheckout,
  createOrder,
} from './checkout-api';
import {
  cartKeyFor,
  clearAttempt,
  loadAttempt,
  newAttempt,
  rotatePaymentAttempt,
  saveAttempt,
  startPaymentAttempt,
} from './checkout-recovery';

const FAILED_ATTEMPT_CODES = new Set([
  'PAYMENT_DECLINED',
  'PAYMENT_INTERNAL_ERROR',
  'STRIPE_SESSION_EXPIRED',
  'GATEWAY_TIMEOUT',
]);

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getSnapshot(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
}

function getServerSnapshot(): null {
  return null;
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cancelled = searchParams.get('status') === 'cancelled';
  const items = useCart((s) => s.items);
  const total = useCart((s) => s.total());
  const clear = useCart((s) => s.clear);

  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isLoggedIn = Boolean(token);
  const [method, setMethod] = useState<'WALLET' | 'CARD'>('WALLET');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState<number>(0);
  const [couponMessage, setCouponMessage] = useState<string>('');
  const [validatingCoupon, setValidatingCoupon] = useState<boolean>(false);
  const [validatedCartSignature, setValidatedCartSignature] = useState<string | null>(null);
  const couponRequestId = useRef(0);

  // Giữ orderId trong cùng phiên trang checkout. Retry không được POST /orders lần nữa.
  const [pendingOrder, setPendingOrder] = useState<{ id: number; cartKey: string; total: number } | null>(null);
  const [paymentLocked, setPaymentLocked] = useState(false);

  useEffect(() => {
    if (!items.length) router.replace('/cart');
  }, [items.length, router]);

  // Không dùng quote đã cũ nếu người dùng sửa giỏ hàng sau khi validate.
  const cartSignature = JSON.stringify(items.map(({ productId, size, toppings, qty, unitPrice }) => ({
    productId, size, toppings: [...toppings].sort(), qty, unitPrice,
  })));
  const cartKey = cartKeyFor(items);

  const selectedMethod = method;
  const isPaymentLocked = paymentLocked;
  const activeCouponCode = validatedCartSignature === cartSignature ? couponCode : null;
  const activeCouponDiscount = activeCouponCode ? couponDiscount : 0;
  const finalTotal = pendingOrder?.cartKey === cartSignature
    ? pendingOrder.total
    : Math.max(0, total - activeCouponDiscount);

  if (!items.length) return null;

  const handleApplyCoupon = async () => {
    if (pendingOrder) {
      setCouponMessage('Đơn đã được tạo. Không thể đổi coupon trên đơn này; hãy hoàn tất thanh toán.');
      return;
    }
    const code = couponInput.trim().toUpperCase();
    const requestId = ++couponRequestId.current;
    // Fail closed: không giữ mã cũ khi bắt đầu xác minh một mã mới.
    setCouponCode(null);
    setCouponDiscount(0);
    setValidatedCartSignature(null);
    if (!code) {
      setCouponMessage('Vui lòng nhập mã giảm giá');
      return;
    }
    setValidatingCoupon(true);
    setCouponMessage('');
    try {
      const res = await api<{ valid: boolean; discount: number }>('/coupons/validate', {
        method: 'POST',
        body: JSON.stringify({ code, orderTotal: total }),
      });
      if (requestId !== couponRequestId.current) return; // response cũ không ghi đè response mới
      if (res.valid !== true || !Number.isSafeInteger(res.discount) ||
          res.discount < 0 || res.discount > total) {
        throw new Error('Backend trả kết quả coupon không hợp lệ. Vui lòng thử lại.');
      }
      // Chỉ lưu quote cho đúng giỏ hàng lúc gửi request; giỏ mới phải validate lại.
      setCouponCode(code);
      setCouponDiscount(res.discount);
      setValidatedCartSignature(cartSignature);
      setCouponMessage(`Áp dụng thành công mã ${code}: -${res.discount.toLocaleString('vi-VN')}đ`);
    } catch (e: unknown) {
      if (requestId !== couponRequestId.current) return;
      setCouponCode(null);
      setCouponDiscount(0);
      setValidatedCartSignature(null);
      setCouponMessage(e instanceof Error ? e.message : 'Không thể xác minh mã giảm giá với máy chủ.');
    } finally {
      if (requestId === couponRequestId.current) setValidatingCoupon(false);
    }
  };

  const handlePay = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setError('Vui lòng đăng nhập trước khi tiến hành thanh toán.');
      return;
    }

    let attempt = loadAttempt(cartKey) ?? newAttempt(cartKey);
    if (pendingOrder && pendingOrder.cartKey !== cartKey) {
      setPendingOrder(null);
      clearAttempt();
      attempt = newAttempt(cartKey);
    }

    setLoading(true);
    setError('');

    try {
      saveAttempt(attempt);

      if (!attempt.orderId) {
        const order = await createOrder(
          {
            items: items.map(({ productId, size, toppings, qty }) => ({
              productId,
              size,
              toppings,
              qty,
            })),
            couponCode: activeCouponCode ?? undefined,
          },
          attempt.orderKey,
        );
        if (!Number.isSafeInteger(order.id) || !Number.isSafeInteger(order.total) || order.total < 0) {
          throw new Error('Backend trả dữ liệu đơn hàng không hợp lệ. Kiểm tra lịch sử đơn trước khi thử lại.');
        }
        attempt = { ...attempt, orderId: order.id };
        saveAttempt(attempt);
        setPendingOrder({ id: order.id, cartKey, total: order.total });
      }

      attempt = startPaymentAttempt(attempt, method);
      saveAttempt(attempt);
      setPaymentLocked(true);

      if (!attempt.orderId || !attempt.paymentKey || !attempt.method) {
        throw new Error('Không thể khôi phục lượt thanh toán. Vui lòng thử lại.');
      }

      const result = await createCheckout(
        attempt.orderId,
        attempt.method,
        attempt.paymentKey,
      );

      window.location.assign(result.checkoutUrl);
    } catch (e: unknown) {
      const apiError = e instanceof CheckoutApiError ? e : null;

      if (apiError?.code === 'ORDER_ALREADY_PAID') {
        clearAttempt();
        clear();
        if (attempt.orderId) {
          router.replace(`/orders/${attempt.orderId}/confirmed`);
          return;
        }
      }

      if (apiError?.code === 'IDEMPOTENCY_KEY_REUSED') {
        saveAttempt(rotatePaymentAttempt(attempt));
      } else if (apiError?.code === 'STRIPE_SESSION_FAILED' && apiError.retryable) {
        // Server kept payment PENDING; retrying the same key recreates the session.
      } else if (apiError && FAILED_ATTEMPT_CODES.has(apiError.code ?? '')) {
        saveAttempt(rotatePaymentAttempt(attempt));
      }

      setPaymentLocked(false);
      setError(
        e instanceof Error
          ? e.message
          : 'Đã xảy ra lỗi kết nối. Kiểm tra lịch sử đơn trước khi tạo lần khác.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      {/* Auth Warning Banner */}
      {!isLoggedIn && (
        <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <p className="text-sm">Bạn chưa đăng nhập. Vui lòng đăng nhập để tích điểm và bảo vệ đơn hàng.</p>
          </div>
          <Link
            href="/login"
            className="px-4 py-1.5 rounded-lg bg-amber-500 text-stone-950 font-semibold text-xs hover:bg-amber-400 transition"
          >
            Đăng nhập ngay
          </Link>
        </div>
      )}

      <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between pb-5 border-b border-stone-800">
          <div>
            <h1 className="text-2xl font-serif font-bold text-stone-100">Xác Nhận & Thanh Toán</h1>
            <p className="text-xs text-stone-400 mt-1">Hệ thống đặt cà phê thanh toán không tiền mặt BrewLite</p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Cashless MVP
          </span>
        </div>

        {/* Tóm tắt món đã chọn */}
        <div className="py-4 border-b border-stone-800/80">
          <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
            Món trong đơn ({items.reduce((s, i) => s + i.qty, 0)})
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-sm py-1">
                <div>
                  <span className="text-stone-200 font-medium">Món #{item.productId}</span>
                  <span className="text-xs text-stone-400 ml-2">Size {item.size} × {item.qty}</span>
                  {item.toppings.length > 0 && (
                    <span className="text-xs text-amber-400/80 block">+ {item.toppings.join(', ')}</span>
                  )}
                </div>
                <span className="text-stone-300 font-mono">
                  {(item.unitPrice * item.qty).toLocaleString('vi-VN')}đ
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Mã giảm giá (Coupon Code - Task 10.4) */}
        <div className="py-4 border-b border-stone-800/80">
          <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider block mb-2">
            Mã khuyến mãi / Coupon (Task 10)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Nhập mã (vd: GIAM10, GIAM15K)"
              value={couponInput}
              disabled={loading || Boolean(pendingOrder)}
              onChange={(e) => {
                couponRequestId.current += 1;
                setValidatingCoupon(false);
                setCouponInput(e.target.value);
                setCouponCode(null);
                setCouponDiscount(0);
                setValidatedCartSignature(null);
                setCouponMessage('');
              }}
              className="flex-1 bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500 uppercase tracking-wider"
            />
            <button
              type="button"
              onClick={handleApplyCoupon}
              disabled={validatingCoupon || loading || Boolean(pendingOrder)}
              className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-amber-400 rounded-xl text-xs font-semibold border border-stone-700 transition"
            >
              {validatingCoupon ? 'Đang kiểm tra…' : 'Áp dụng'}
            </button>
          </div>
          {couponMessage && (validatedCartSignature === null || activeCouponCode) && (
            <p className={`text-xs mt-2 ${activeCouponCode ? 'text-emerald-400' : 'text-red-400'}`}>
              {couponMessage}
            </p>
          )}
          {couponCode && !activeCouponCode && (
            <p className="text-xs mt-2 text-amber-400">Giỏ hàng đã thay đổi. Vui lòng áp dụng lại mã giảm giá.</p>
          )}
        </div>

        {/* Phương thức thanh toán (Task 8 & Wireframe 4) */}
        <div className="py-4 border-b border-stone-800/80">
          <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
            Chọn phương thức thanh toán
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                selectedMethod === 'WALLET'
                  ? 'bg-amber-500/10 border-amber-500/50 text-stone-100'
                  : 'bg-stone-950 border-stone-800/80 text-stone-400 hover:border-stone-700'
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                checked={selectedMethod === 'WALLET'}
                disabled={isPaymentLocked}
                onChange={() => setMethod('WALLET')}
                className="accent-amber-500"
              />
              <div>
                <div className="font-semibold text-sm flex items-center gap-1.5">
                  <span>📱</span> Ví điện tử
                </div>
                <div className="text-[11px] text-stone-400">MoMo / ZaloPay (Không tiền mặt)</div>
              </div>
            </label>

            <label
              className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                selectedMethod === 'CARD'
                  ? 'bg-amber-500/10 border-amber-500/50 text-stone-100'
                  : 'bg-stone-950 border-stone-800/80 text-stone-400 hover:border-stone-700'
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                checked={selectedMethod === 'CARD'}
                disabled={isPaymentLocked}
                onChange={() => setMethod('CARD')}
                className="accent-amber-500"
              />
              <div>
                <div className="font-semibold text-sm flex items-center gap-1.5">
                  <span>💳</span> Thẻ ngân hàng
                </div>
                <div className="text-[11px] text-stone-400">ATM Napas / Visa / Mastercard</div>
              </div>
            </label>
          </div>
        </div>

        {/* Tổng kết tiền */}
        <div className="space-y-1.5 py-3 text-sm">
          <div className="flex justify-between text-stone-400">
            <span>Tạm tính</span>
            <span className="font-mono">{total.toLocaleString('vi-VN')}đ</span>
          </div>
          {activeCouponDiscount > 0 && (
            <div className="flex justify-between text-emerald-400">
              <span>Khuyến mãi ({activeCouponCode})</span>
              <span className="font-mono">-{activeCouponDiscount.toLocaleString('vi-VN')}đ</span>
            </div>
          )}
          {pendingOrder?.cartKey === cartSignature && (
            <p className="text-xs text-stone-400">Số tiền chính thức đã được backend tính lại khi tạo đơn.</p>
          )}
          <div className="flex justify-between text-base font-bold text-stone-100 pt-2 border-t border-stone-800">
            <span>Tổng thanh toán</span>
            <span className="text-xl font-mono text-amber-400">
              {finalTotal.toLocaleString('vi-VN')}đ
            </span>
          </div>
        </div>

        {/* Thông báo lỗi */}
        {(error || cancelled) && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs leading-relaxed">
            {error || 'Bạn đã huỷ thanh toán. Có thể bấm thanh toán lại.'}
          </div>
        )}

        {/* Nút hành động */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Link
            href="/cart"
            className="flex-1 py-3 px-4 rounded-xl border border-stone-800 text-stone-300 hover:bg-stone-800/60 font-semibold text-center text-sm transition"
          >
            ← Quay lại giỏ hàng
          </Link>
          <button
            onClick={handlePay}
            disabled={loading || validatingCoupon || !isLoggedIn}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-bold text-center text-sm shadow-lg shadow-amber-500/20 disabled:opacity-50 transition"
          >
            {loading ? 'Đang xử lý giao dịch…' : 'Xác nhận thanh toán'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutContent />
    </Suspense>
  );
}

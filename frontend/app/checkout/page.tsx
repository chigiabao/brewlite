// Trang thanh toán hoàn chỉnh. Người phụ trách: F (Task 8 UI) & E (Tạo đơn) & G (Khuyến mãi).
'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useCart } from '@/store/cart';

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

export default function CheckoutPage() {
  const router = useRouter();
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

  // Demo simulator for US-05 failure test
  const [simulateFailure, setSimulateFailure] = useState(false);

  // Một khóa cho một lần thanh toán; bấm thử lại giữ nguyên khóa (Task 10 – F).
  const idemKey = useRef<string | null>(null);
  // Giữ orderId trong cùng phiên trang checkout. Retry không được POST /orders lần nữa.
  const pendingOrder = useRef<{ id: number; cartKey: string; total: number } | null>(null);

  useEffect(() => {
    if (!items.length) router.replace('/cart');
  }, [items.length, router]);

  // Không dùng quote đã cũ nếu người dùng sửa giỏ hàng sau khi validate.
  const cartSignature = JSON.stringify(items.map(({ productId, size, toppings, qty, unitPrice }) => ({
    productId, size, toppings: [...toppings].sort(), qty, unitPrice,
  })));
  const activeCouponCode = validatedCartSignature === cartSignature ? couponCode : null;
  const activeCouponDiscount = activeCouponCode ? couponDiscount : 0;
  const finalTotal = pendingOrder.current?.cartKey === cartSignature
    ? pendingOrder.current.total
    : Math.max(0, total - activeCouponDiscount);

  if (!items.length) return null;

  const handleApplyCoupon = async () => {
    if (pendingOrder.current) {
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

    const cartKey = cartSignature;

    // Không dùng nhầm đơn cũ nếu giỏ đã thay đổi trong khi checkout.
    if (pendingOrder.current && pendingOrder.current.cartKey !== cartKey) {
      pendingOrder.current = null;
      idemKey.current = null;
    }
    idemKey.current ??= crypto.randomUUID();
    setLoading(true);
    setError('');

    try {
      // E: chỉ tạo đơn 1 lần cho một giỏ. Truyền Idempotency-Key để backend không bị 400 IDEMPOTENCY_KEY_REQUIRED.
      if (!pendingOrder.current) {
        const order = await api<{ id: number; total: number }>('/orders', {
          method: 'POST',
          headers: { 'Idempotency-Key': idemKey.current },
          body: JSON.stringify({
            items: items.map(({ productId, size, toppings, qty }) => ({
              productId, size, toppings, qty,
            })),
            couponCode: activeCouponCode ?? undefined,
          }),
        });
        if (!Number.isSafeInteger(order.id) || !Number.isSafeInteger(order.total) || order.total < 0) {
          throw new Error('Backend trả dữ liệu đơn hàng không hợp lệ. Kiểm tra lịch sử đơn trước khi thử lại.');
        }
        pendingOrder.current = { id: order.id, cartKey, total: order.total };
      }

      const orderId = pendingOrder.current?.id;
      if (!orderId) throw new Error('Không tạo được đơn hàng. Vui lòng kiểm tra lại lịch sử đơn.');

      // F – Task 8: gọi POST /payments với Idempotency-Key
      const res = await api<{ orderId: number; status: string; orderStatus?: string }>('/payments', {
        method: 'POST',
        headers: { 'Idempotency-Key': idemKey.current },
        body: JSON.stringify({ orderId, method, ...(simulateFailure ? { demoDecline: true } : {}) }),
      });

      const isPaid = res.orderStatus === 'PAID' || res.status === 'SUCCEEDED' || res.status === 'PAID';
      if (isPaid) {
        clear();
        router.push(`/orders/${res.orderId}/confirmed`);
      } else {
        // Kết quả lỗi đã rõ: lần thanh toán tiếp theo cần key mới, nhưng giữ orderId.
        idemKey.current = null;
        setError('Thanh toán lỗi. Giỏ hàng vẫn được giữ nguyên. Vui lòng thử lại.');
      }
    } catch (e: unknown) {
      const msg = (e as Error).message ?? '';
      if (msg.includes('đã được thanh toán') || msg.includes('ORDER_ALREADY_PAID')) {
        clear();
        if (pendingOrder.current?.id) {
          router.push(`/orders/${pendingOrder.current.id}/confirmed`);
          return;
        }
      }
      // Kết quả lỗi đã rõ: lần thanh toán tiếp theo cần key mới, nhưng giữ nguyên orderId (Task 10).
      idemKey.current = null;
      setError(msg || 'Đã xảy ra lỗi kết nối. Kiểm tra lịch sử đơn trước khi tạo lần khác.');
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
              disabled={loading || Boolean(pendingOrder.current)}
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
              disabled={validatingCoupon || loading || Boolean(pendingOrder.current)}
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
                method === 'WALLET'
                  ? 'bg-amber-500/10 border-amber-500/50 text-stone-100'
                  : 'bg-stone-950 border-stone-800/80 text-stone-400 hover:border-stone-700'
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                checked={method === 'WALLET'}
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
                method === 'CARD'
                  ? 'bg-amber-500/10 border-amber-500/50 text-stone-100'
                  : 'bg-stone-950 border-stone-800/80 text-stone-400 hover:border-stone-700'
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                checked={method === 'CARD'}
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

        {/* Công cụ demo cho giảng viên (US-05 Acceptance Criteria) */}
        <div className="py-3 px-3.5 my-4 bg-stone-950/70 border border-stone-800 rounded-xl">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-stone-400 hover:text-stone-300">
            <input
              type="checkbox"
              checked={simulateFailure}
              onChange={(e) => setSimulateFailure(e.target.checked)}
              className="accent-red-500 w-4 h-4 rounded"
            />
            <span>
              <strong className="text-amber-400">[Demo cho GV]:</strong> Gửi yêu cầu mô phỏng ngân hàng từ chối <em>qua backend thật</em> (đơn chuyển <code className="text-red-400">PAYMENT_FAILED</code>). Cần bật <code>MOCK_GATEWAY_TEST_MODE=true</code> trên backend local.
            </span>
          </label>
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
          {pendingOrder.current?.cartKey === cartSignature && (
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
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs leading-relaxed">
            {error}
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
            disabled={loading || validatingCoupon}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-bold text-center text-sm shadow-lg shadow-amber-500/20 disabled:opacity-50 transition"
          >
            {loading ? 'Đang xử lý giao dịch…' : 'Xác nhận thanh toán'}
          </button>
        </div>
      </div>
    </div>
  );
}

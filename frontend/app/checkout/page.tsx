// Trang thanh toán hoàn chỉnh. Người phụ trách: F (Task 8 UI) & E (Tạo đơn) & G (Khuyến mãi).
'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { CHECKOUT_SESSION_KEY, clearCheckoutSession, isDefinitivePaymentFailure, isPaidOrderStatus, jwtSubject, loadCheckoutSession, saveCheckoutSession, type CheckoutSession } from '@/lib/checkout-session';
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

// sessionStorage giữ qua reload nhưng không chuyển sang tab khác; state được đồng bộ trong tab.
function subscribeCheckout(callback: () => void) {
  window.addEventListener('brewlite-checkout-session', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('brewlite-checkout-session', callback);
    window.removeEventListener('storage', callback);
  };
}
function getCheckoutSnapshot() {
  return sessionStorage.getItem(CHECKOUT_SESSION_KEY);
}
function getCheckoutServerSnapshot(): null { return null; }
function subscribeHydration(callback: () => void) {
  return useCart.persist.onFinishHydration(callback);
}
function getCartHydration() { return useCart.persist.hasHydrated(); }
function getServerCartHydration() { return false; }

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

  // Balance chỉ có hiệu lực với đúng JWT đã dùng để tải, tránh lộ điểm khi đổi tài khoản.
  const [balanceResult, setBalanceResult] = useState<{
    token: string;
    loyaltyPoints: number | null;
    error: string;
  } | null>(null);
  const [pointsChoice, setPointsChoice] = useState<{ token: string; value: number } | null>(null);
  const pointsRequested = pointsChoice?.token === token ? pointsChoice.value : 0;
  const availablePoints = token && balanceResult?.token === token ? balanceResult.loyaltyPoints : null;
  const balanceLoading = Boolean(token) && balanceResult?.token !== token;
  const balanceError = token && balanceResult?.token === token ? balanceResult.error : '';

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    // GET /rewards/me dùng bearer từ api client. Không dùng số dư giả khi lỗi API.
    api<{ loyaltyPoints: number }>('/rewards/me')
      .then(({ loyaltyPoints }) => {
        if (cancelled) return;
        if (!Number.isSafeInteger(loyaltyPoints) || loyaltyPoints < 0) {
          throw new Error('Số dư điểm trả về không hợp lệ');
        }
        setBalanceResult({ token, loyaltyPoints, error: '' });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBalanceResult({
            token, loyaltyPoints: null,
            error: err instanceof Error ? err.message : 'Không tải được điểm thưởng',
          });
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  // Demo simulator for US-05 failure test
  const [simulateFailure, setSimulateFailure] = useState(false);

  const inFlight = useRef(false);
  const finishing = useRef(false);
  const sessionSnapshot = useSyncExternalStore(subscribeCheckout, getCheckoutSnapshot, getCheckoutServerSnapshot);
  const checkoutSession = useMemo(() => {
    // useSyncExternalStore phải được đọc để cập nhật ngay khi ghi sessionStorage trong cùng tab.
    if (sessionSnapshot === null) return null;
    return loadCheckoutSession(token);
  }, [sessionSnapshot, token]);
  const cartHydrated = useSyncExternalStore(subscribeHydration, getCartHydration, getServerCartHydration);

  useEffect(() => {
    if (cartHydrated && !items.length && !checkoutSession && !finishing.current) router.replace('/cart');
  }, [cartHydrated, items.length, checkoutSession, router]);

  // Không dùng quote đã cũ nếu người dùng sửa giỏ hàng sau khi validate.
  const cartSignature = JSON.stringify(items.map(({ productId, size, toppings, qty, unitPrice }) => ({
    productId, size, toppings: [...toppings].sort(), qty, unitPrice,
  })));
  const activeCouponCode = validatedCartSignature === cartSignature ? couponCode : null;
  const activeCouponDiscount = activeCouponCode ? couponDiscount : 0;
  // Points chỉ giảm số tiền còn lại SAU coupon, và không vượt balance đang đọc được.
  const maxRedeemable = Math.min(
    availablePoints ?? 0,
    Math.max(0, total - activeCouponDiscount),
  );
  const previewPoints = Math.min(pointsRequested, maxRedeemable);
  const sessionMismatch = Boolean(checkoutSession && checkoutSession.cartKey !== cartSignature);
  const selectedMethod = checkoutSession?.attempt?.method ?? method;
  const savedOrder = checkoutSession?.cartKey === cartSignature && checkoutSession.orderId !== null
    ? checkoutSession : null;
  const appliedPoints = savedOrder ? (savedOrder.pointsRedeemed ?? 0) : previewPoints;
  const finalTotal = savedOrder && savedOrder.orderTotal !== null
    ? savedOrder.orderTotal
    : Math.max(0, total - activeCouponDiscount - appliedPoints);

  if (!cartHydrated || (!items.length && !checkoutSession)) return null;

  const handleApplyCoupon = async () => {
    if (checkoutSession) {
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

  const finishPaid = (orderId: number) => {
    finishing.current = true;
    clearCheckoutSession();
    clear();
    router.push(`/orders/${orderId}/confirmed`);
  };

  const handlePay = async () => {
    if (inFlight.current || sessionMismatch || !items.length) return;
    const activeToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const subject = jwtSubject(activeToken);
    if (!activeToken || !subject) {
      setError('Vui lòng đăng nhập bằng tài khoản hợp lệ trước khi thanh toán.');
      return;
    }
    if (pointsRequested > 0 && (balanceLoading || availablePoints === null) && !checkoutSession) {
      setError('Chưa xác minh được số dư điểm thưởng. Vui lòng tải lại trang.');
      return;
    }
    inFlight.current = true;
    setLoading(true);
    setError('');

    let current: CheckoutSession | null = null;
    let creatingOrder = false;
    try {
      current = loadCheckoutSession(activeToken);
      if (current && current.cartKey !== cartSignature) {
        setError('Giỏ hàng đã đổi khi đang xử lý đơn cũ. Mở lịch sử đơn và giải quyết đơn trước khi tiếp tục.');
        return;
      }
      if (!current) {
        // LƯU TRƯỚC KHI POST: mất mạng ở bước tạo Order vẫn retry cùng key + cùng payload.
        current = {
          version: 1, subject, cartKey: cartSignature,
          orderKey: crypto.randomUUID(),
          orderRequest: {
            items: items.map(({ productId, size, toppings, qty }) => ({ productId, size, toppings, qty })),
            ...(activeCouponCode ? { couponCode: activeCouponCode } : {}),
            pointsToRedeem: previewPoints,
          },
          orderId: null, orderTotal: null, pointsRedeemed: null, attempt: null,
        };
        saveCheckoutSession(current);
      }
      if (current.orderId === null) {
        creatingOrder = true;
        const created = await api<{ id: number; status: string; total: number; pointsRedeemed: number }>('/orders', {
          method: 'POST',
          headers: { 'Idempotency-Key': current.orderKey },
          body: JSON.stringify(current.orderRequest),
        });
        creatingOrder = false;
        if (!Number.isSafeInteger(created.id) || created.id <= 0 ||
            !Number.isSafeInteger(created.total) || created.total < 0 ||
            !Number.isSafeInteger(created.pointsRedeemed) || created.pointsRedeemed < 0) {
          throw new Error('Phản hồi tạo đơn không hợp lệ. Giữ nguyên khóa và kiểm tra lịch sử đơn.');
        }
        current = {
          ...current, orderId: created.id, orderTotal: created.total,
          pointsRedeemed: created.pointsRedeemed,
        };
        saveCheckoutSession(current);
        if (isPaidOrderStatus(created.status)) {
          // Đơn đã được thanh toán từ trước (replay order-key).
          const verified = await api<{ status: string }>(`/orders/${created.id}`);
          if (isPaidOrderStatus(verified.status)) finishPaid(created.id);
          return;
        }
      }
      const orderId = current.orderId;
      if (orderId === null) throw new Error('Chưa nhận được mã đơn.');
      // Khi thanh toán đang không rõ kết quả, tuyệt đối giữ nguyên method/demoDecline + payment key.
      if (!current.attempt) {
        current = {
          ...current,
          attempt: { key: crypto.randomUUID(), method, demoDecline: simulateFailure },
        };
        saveCheckoutSession(current);
      }
      const attempt = current.attempt;
      const res = await api<{ orderId: number; status: string; orderStatus: string }>('/payments', {
        method: 'POST',
        headers: { 'Idempotency-Key': attempt.key },
        body: JSON.stringify({ orderId, method: attempt.method,
          ...(attempt.demoDecline ? { demoDecline: true } : {}) }),
      });
      if (res.orderId !== orderId) throw new Error('Payment trả mã đơn không khớp. Cần kiểm tra thủ công.');
      if (isPaidOrderStatus(res.orderStatus) && res.status === 'SUCCEEDED') {
        finishPaid(orderId);
      } else if (res.orderStatus === 'PAYMENT_FAILED' || res.status === 'FAILED') {
        saveCheckoutSession({ ...current, attempt: null });
        setError('Thanh toán thất bại. Đơn được giữ lại; thử lại sẽ tạo khóa thanh toán mới.');
      } else {
        setError('Chưa xác định được kết quả thanh toán. Bấm Thử lại để gửi đúng khóa giao dịch cũ.');
      }
    } catch (e: unknown) {
      const apiError = e instanceof ApiError ? e : null;
      const message = e instanceof Error ? e.message : 'Không thể kết nối máy chủ';
      if (creatingOrder && apiError && [400, 404, 409, 422].includes(apiError.status)) {
        // API đã từ chối tạo đơn (validation/stock/coupon); không có transaction nào commit.
        clearCheckoutSession();
        setError(message + '. Hãy chỉnh giỏ hàng hoặc mã giảm giá rồi thử lại.');
        return;
      }
      if (current?.orderId !== null && current?.orderId !== undefined &&
          apiError?.code === 'ORDER_ALREADY_PAID') {
        // Không tin vào thông báo 409; chỉ xóa giỏ khi GET Order đã xác minh thật.
        try {
          const order = await api<{ status: string }>(`/orders/${current.orderId}`);
          if (isPaidOrderStatus(order.status)) {
            finishPaid(current.orderId);
            return;
          }
        } catch { /* giữ nguyên phiên để xử lý tiếp */ }
      }
      if (current?.orderId !== null && current?.orderId !== undefined &&
          (isDefinitivePaymentFailure(apiError?.status, apiError?.code) ||
            apiError?.status === 400)) {
        // Backend đã trả kết quả lỗi rõ ràng; lần thử MỚI dùng payment key mới.
        saveCheckoutSession({ ...current, attempt: null });
        setError(message + ' Đơn hàng và giỏ vẫn còn; bạn có thể thử lại.');
      } else {
        // Mất kết nối / HTTP 500 / 409 IN_PROGRESS: không đổi key, không tạo Order mới.
        setError(message + '. Kết quả có thể chưa rõ; hãy thử lại bằng chính khóa cũ hoặc xem lịch sử đơn.');
      }
    } finally {
      inFlight.current = false;
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

        {/* G – Loyalty Points (1 điểm = 1 VNĐ). Backend vẫn là nguồn giá chính thức. */}
        <div className="py-4 border-b border-stone-800/80">
          <label htmlFor="redeem-points" className="text-xs font-semibold text-stone-400 uppercase tracking-wider block mb-2">
            Sử dụng điểm thưởng (Loyalty Points)
          </label>
          {!isLoggedIn ? (
            <p className="text-xs text-amber-400">Đăng nhập để xem và sử dụng điểm tích lũy.</p>
          ) : balanceLoading ? (
            <p className="text-xs text-stone-400">Đang tải số dư điểm…</p>
          ) : balanceError ? (
            <p role="alert" className="text-xs text-red-400">{balanceError}. Bạn vẫn có thể thanh toán không dùng điểm.</p>
          ) : (
            <>
              <div className="text-sm text-stone-300 mb-2">
                Số dư khả dụng: <strong className="text-amber-400">{(availablePoints ?? 0).toLocaleString('vi-VN')} điểm</strong>
                <span className="text-xs text-stone-500 ml-2">(1 điểm = 1đ)</span>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  id="redeem-points"
                  type="number"
                  min={0}
                  step={1}
                  max={maxRedeemable}
                  inputMode="numeric"
                  value={Math.min(pointsRequested, maxRedeemable) || ''}
                  disabled={loading || Boolean(checkoutSession) || maxRedeemable === 0}
                  onChange={(e) => {
                    const input = e.target.value;
                    if (!/^\d*$/.test(input)) return;
                    const n = input ? Number(input) : 0;
                    if (!Number.isSafeInteger(n)) return;
                    if (token) setPointsChoice({ token, value: Math.min(n, maxRedeemable) });
                  }}
                  placeholder="0"
                  className="flex-1 min-w-0 bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-sm text-stone-100 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  disabled={loading || Boolean(checkoutSession) || maxRedeemable === 0}
                  onClick={() => { if (token) setPointsChoice({ token, value: maxRedeemable }); }}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-amber-400 rounded-xl text-xs font-semibold border border-stone-700"
                >
                  Dùng tối đa
                </button>
              </div>
              <p className="text-xs text-stone-500 mt-2">
                Có thể dùng tối đa {maxRedeemable.toLocaleString('vi-VN')} điểm cho giỏ hiện tại; số điểm thực trừ được backend chốt khi tạo đơn.
              </p>
            </>
          )}
          {savedOrder && (
            <p className="text-xs text-emerald-400 mt-2">
              Đã giữ chỗ {savedOrder.pointsRedeemed.toLocaleString('vi-VN')} điểm cho đơn #{savedOrder.id}. Không đổi điểm sau khi đã tạo đơn.
            </p>
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
                disabled={loading || Boolean(checkoutSession?.attempt)}
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
                disabled={loading || Boolean(checkoutSession?.attempt)}
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
              checked={checkoutSession?.attempt?.demoDecline ?? simulateFailure}
              disabled={loading || Boolean(checkoutSession?.attempt)}
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
          {appliedPoints > 0 && (
            <div className="flex justify-between text-emerald-400">
              <span>Đổi điểm thưởng{savedOrder ? ' (đã giữ chỗ)' : ' (dự kiến)'}</span>
              <span className="font-mono">-{appliedPoints.toLocaleString('vi-VN')}đ</span>
            </div>
          )}
          {savedOrder && (
            <p className="text-xs text-stone-400">Số tiền chính thức đã được backend tính lại khi tạo đơn.</p>
          )}
          <div className="flex justify-between text-base font-bold text-stone-100 pt-2 border-t border-stone-800">
            <span>Tổng thanh toán</span>
            <span className="text-xl font-mono text-amber-400">
              {finalTotal.toLocaleString('vi-VN')}đ
            </span>
          </div>
        </div>

        {sessionMismatch && (
          <div role="alert" className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
            Giỏ hàng đã thay đổi so với phiên thanh toán được lưu. Để tránh tạo đơn trùng, hãy kiểm tra
            <Link className="underline ml-1" href="/orders">lịch sử đơn hàng</Link> trước khi thử thanh toán tiếp.
          </div>
        )}
        {checkoutSession && !sessionMismatch && (
          <div className="mt-4 p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-200 text-xs">
            {checkoutSession.orderId
              ? `Đang tiếp tục đơn #${checkoutSession.orderId} sau khi tải lại trang.`
              : 'Đang giữ khóa tạo đơn cũ: thử lại sẽ không tạo đơn trùng.'}
            {checkoutSession.attempt && <p className="mt-1">Giao dịch chưa có kết quả rõ ràng: dùng lại cùng khóa và phương thức thanh toán.</p>}
          </div>
        )}
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
            disabled={loading || validatingCoupon || sessionMismatch || !cartHydrated}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-bold text-center text-sm shadow-lg shadow-amber-500/20 disabled:opacity-50 transition"
          >
            {loading ? 'Đang xử lý giao dịch…' : checkoutSession?.attempt ? 'Thử lại giao dịch cũ' : checkoutSession ? 'Tiếp tục thanh toán' : 'Xác nhận thanh toán'}
          </button>
        </div>
      </div>
    </div>
  );
}

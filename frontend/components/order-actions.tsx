'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { clearCheckoutSession, isDefinitivePaymentFailure, isPaidOrderStatus, jwtSubject, loadCheckoutSession } from '@/lib/checkout-session';
import { useCart } from '@/store/cart';

type PaymentConfig = { provider: 'MOCK' | 'STRIPE' | 'VNPAY'; mockDeclineEnabled: boolean };
type OrderDetail = {
  id: number; status: string; total: number;
  items: { id: number; size: string; qty: number; lineTotal: number; product: { name: string } }[];
  payments?: { method: 'WALLET' | 'CARD' | 'VNPAY'; status: string }[];
};
type Attempt = { key: string; method: 'WALLET' | 'CARD' | 'VNPAY'; demoDecline: boolean; provider: PaymentConfig['provider'] };

const payable = (status: string) => status === 'PENDING' || status === 'PAYMENT_FAILED';

function readAttempt(storageKey: string): Attempt | null {
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) return null;
  const a = JSON.parse(raw) as Attempt;
  if (!a || typeof a.key !== 'string' || !a.key || !['WALLET', 'CARD', 'VNPAY'].includes(a.method) ||
      typeof a.demoDecline !== 'boolean' || !['MOCK', 'STRIPE', 'VNPAY'].includes(a.provider)) {
    throw new Error('Phiên thanh toán không hợp lệ. Vui lòng kiểm tra trạng thái đơn trước khi thử lại.');
  }
  return a;
}

// Chỉ dọn giỏ gắn với đúng đơn này; thanh toán đơn cũ không được xóa giỏ mới.
function clearOrderSession(token: string, orderId: number, paid: boolean) {
  const session = loadCheckoutSession(token);
  if (!session || session.orderId !== orderId) return;
  if (paid) {
    if (!useCart.persist.hasHydrated()) return; // Trang xác nhận sẽ dọn sau hydration.
    const cartKey = JSON.stringify(useCart.getState().items.map(
      ({ productId, size, toppings, qty, unitPrice }) => ({
        productId, size, toppings: [...toppings].sort(), qty, unitPrice,
      }),
    ));
    if (cartKey === session.cartKey) useCart.getState().clear();
  }
  clearCheckoutSession();
}

export function OrderActions({ orderId, status, token }: { orderId: number; status: string; token: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState<{ order: OrderDetail; config: PaymentConfig } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [method, setMethod] = useState<Attempt['method']>('WALLET');
  const [demoDecline, setDemoDecline] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const subject = jwtSubject(token);
  const storageKey = `brewlite-order-payment:${subject}:${orderId}`;

  useEffect(() => {
    if ((details || confirmCancel) && !dialog.current?.open) dialog.current?.showModal();
  }, [details, confirmCancel]);

  async function refreshOrders() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['orders'] }),
      queryClient.invalidateQueries({ queryKey: ['confirmed-order'] }),
    ]);
  }

  function assertCurrentAccount() {
    if (!subject || localStorage.getItem('token') !== token) {
      throw new Error('Tài khoản đã thay đổi. Vui lòng tải lại trang.');
    }
  }

  function closeDialog() {
    if (inFlight.current) return;
    dialog.current?.close();
    setDetails(null);
    setConfirmCancel(false);
  }

  async function finishPayment() {
    const verified = await api<OrderDetail>(`/orders/${orderId}`);
    assertCurrentAccount();
    if (verified.id !== orderId || !isPaidOrderStatus(verified.status)) {
      throw new Error('Chưa xác nhận được thanh toán thành công. Hãy kiểm tra lại trạng thái đơn.');
    }
    clearOrderSession(token, orderId, true);
    sessionStorage.removeItem(storageKey);
    dialog.current?.close();
    setDetails(null);
    await refreshOrders();
    router.push(`/orders/${orderId}/confirmed`);
  }

  async function openPayment() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      assertCurrentAccount();
      const [order, config] = await Promise.all([
        api<OrderDetail>(`/orders/${orderId}`), api<PaymentConfig>('/payments/config'),
      ]);
      assertCurrentAccount();
      if (order.id !== orderId || !payable(order.status)) {
        await refreshOrders();
        throw new Error('Đơn đã thay đổi trạng thái và không còn chờ thanh toán.');
      }
      if (!['MOCK', 'STRIPE'].includes(config.provider)) throw new Error('Chưa xác định được phương thức thanh toán.');
      // Một phiên bên ngoài đã tạo phải được mở lại, kể cả cấu hình hiện tại là MOCK.
      const pending = order.payments?.find(payment => payment.status === 'PENDING');
      const effectiveConfig = pending ? { ...config,
        provider: pending.method === 'VNPAY' ? 'VNPAY' as const : 'STRIPE' as const,
      } : config;
      const saved = readAttempt(storageKey);
      setAttempt(saved);
      setMethod(saved?.method ?? pending?.method ?? 'WALLET');
      setDemoDecline(saved?.demoDecline ?? false);
      setDetails({ order, config: effectiveConfig });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được đơn hàng.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function pay() {
    if (inFlight.current || !details) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      assertCurrentAccount();
      const current = readAttempt(storageKey) ?? {
        key: crypto.randomUUID(), method, demoDecline, provider: details.config.provider,
      };
      if (current.provider !== details.config.provider) {
        throw new Error('Cổng thanh toán đã thay đổi. Cần kiểm tra giao dịch cũ trước khi tiếp tục.');
      }
      // Lưu TRƯỚC request: mất mạng/reload vẫn dùng đúng khóa và phương thức cũ.
      sessionStorage.setItem(storageKey, JSON.stringify(current));
      setAttempt(current);
      const result = await api<{ orderId: number; status: string; checkoutUrl?: string }>(
        current.provider === 'MOCK' ? '/payments' : '/payments/checkout', {
          method: 'POST', headers: { 'Idempotency-Key': current.key },
          body: JSON.stringify({ orderId, method: current.method,
            ...(current.provider === 'MOCK' && current.demoDecline ? { demoDecline: true } : {}) }),
        },
      );
      assertCurrentAccount();
      if (result.orderId !== orderId) throw new Error('Kết quả trả về không khớp mã đơn.');
      if (current.provider !== 'MOCK' && result.status !== 'SUCCEEDED') {
        if (!result.checkoutUrl || (current.provider === 'STRIPE'
          ? !result.checkoutUrl.startsWith('https://checkout.stripe.com/')
          : !result.checkoutUrl.startsWith('https://'))) {
          throw new Error('Không nhận được trang thanh toán hợp lệ.');
        }
        window.location.assign(result.checkoutUrl);
        return;
      }
      if (result.status === 'FAILED') {
        sessionStorage.removeItem(storageKey);
        setAttempt(null);
        await refreshOrders();
        setError('Thanh toán bị từ chối. Đơn hàng và giỏ vẫn còn; bạn có thể thử lại.');
        return;
      }
      await finishPayment();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ORDER_ALREADY_PAID') {
        try { await finishPayment(); return; } catch { /* Giữ lượt cũ nếu không xác minh được. */ }
      }
      const declined = e instanceof ApiError && (isDefinitivePaymentFailure(e.status, e.code) ||
        e.code === 'STRIPE_SESSION_EXPIRED');
      if (declined) {
        sessionStorage.removeItem(storageKey);
        setAttempt(null);
      }
      // Kết quả chưa rõ: giữ attempt để lần tiếp theo không tạo một giao dịch mới.
      setError(e instanceof ApiError && e.code === 'PAYMENT_IN_PROGRESS'
        ? 'Đơn đang có giao dịch được xử lý. Vui lòng kiểm tra trạng thái trước khi thử lại.'
        : `${e instanceof Error ? e.message : 'Không thể thanh toán.'} ${declined ? 'Bạn có thể thử thanh toán lại.' : 'Kiểm tra trạng thái hoặc thử lại giao dịch cũ.'}`);
      await refreshOrders();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function cancelOrder() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      assertCurrentAccount();
      await api(`/orders/${orderId}/cancel`, { method: 'POST' });
      assertCurrentAccount();
      clearOrderSession(token, orderId, false);
      sessionStorage.removeItem(storageKey);
      dialog.current?.close();
      setConfirmCancel(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Không thể hủy đơn.';
      setError(message === 'ORDER_PAYMENT_IN_PROGRESS'
        ? 'Đơn đang có giao dịch thanh toán. Chưa thể hủy lúc này.'
        : message === 'ORDER_CANNOT_BE_CANCELLED' ? 'Trạng thái hiện tại không cho phép hủy đơn.' : message);
    } finally {
      await refreshOrders();
      inFlight.current = false;
      setBusy(false);
    }
  }

  // Giữ dialog trong cây khi refetch thay đổi status, để hiển thị kết quả lỗi rõ ràng.
  if (!payable(status) && !details && !confirmCancel) return null;

  return (
    <div className="mt-3 text-sm">
      {payable(status) && <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void openPayment()}
          className="rounded-lg bg-amber-500 px-3 py-2 font-semibold text-stone-950 hover:bg-amber-400 disabled:opacity-50">
          {busy && !details && !confirmCancel ? 'Đang tải…' : 'Tiếp tục thanh toán'}
        </button>
        <button type="button" disabled={busy} onClick={() => { setError(''); setConfirmCancel(true); }}
          className="rounded-lg border border-red-400/50 px-3 py-2 text-red-300 hover:bg-red-500/10 disabled:opacity-50">Hủy đơn</button>
      </div>}
      {error && !details && !confirmCancel && <p role="alert" className="mt-2 text-red-300">{error}</p>}
      <dialog ref={dialog} onCancel={(e) => { e.preventDefault(); closeDialog(); }}
        aria-labelledby={`order-action-title-${orderId}`}
        className="m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-2xl border border-stone-700 bg-stone-900 p-6 text-stone-100 shadow-2xl backdrop:bg-black/60">
        <h2 id={`order-action-title-${orderId}`} className="text-xl font-bold text-amber-400">
          {confirmCancel ? `Hủy đơn #${orderId}?` : `Thanh toán đơn #${orderId}`}
        </h2>
        {confirmCancel ? <p className="mt-3 text-stone-300">Đơn sẽ được hủy và hoàn lại tồn kho, mã giảm giá, điểm đã giữ cho đơn. Giỏ hàng của bạn vẫn được giữ nguyên.</p> : details && <>
          <ul className="my-4 space-y-2 text-stone-300">
            {details.order.items.map(item => <li key={item.id} className="flex justify-between gap-3">
              <span>{item.product.name} · {item.size} × {item.qty}</span>
              <span>{item.lineTotal.toLocaleString('vi-VN')}đ</span>
            </li>)}
          </ul>
          <p className="my-4 flex justify-between border-t border-stone-700 pt-3 font-bold">Tổng thanh toán <span className="text-amber-400">{details.order.total.toLocaleString('vi-VN')}đ</span></p>
          <fieldset disabled={busy || Boolean(attempt) || details.order.payments?.some(payment => payment.status === 'PENDING')} className="flex gap-5">
            <legend className="mb-2 text-stone-300">Phương thức thanh toán</legend>
            {(details.config.provider === 'VNPAY' ? ['VNPAY'] as const : ['WALLET', 'CARD'] as const).map(value => <label key={value} className="flex items-center gap-2">
              <input type="radio" name={`resume-method-${orderId}`} checked={method === value} onChange={() => setMethod(value)} />
              {value === 'VNPAY' ? 'VNPay' : value === 'WALLET' ? 'Ví điện tử' : 'Thẻ ngân hàng'}
            </label>)}
          </fieldset>
          {details.config.provider === 'MOCK' && <p className="mt-4 rounded-lg bg-amber-500/10 p-3 text-amber-200">Thanh toán mô phỏng, không trừ tiền thật. Bấm xác nhận bên dưới để hoàn tất đơn.</p>}
          {details.config.provider === 'MOCK' && details.config.mockDeclineEnabled && <label className="mt-3 flex items-center gap-2 text-stone-300">
            <input type="checkbox" checked={demoDecline} disabled={busy || Boolean(attempt)} onChange={e => setDemoDecline(e.target.checked)} />Mô phỏng thanh toán thất bại
          </label>}
          {attempt && <p className="mt-3 text-xs text-stone-400">Đang giữ lượt thanh toán trước. Thử lại sẽ không tạo đơn mới hoặc thu lặp.</p>}
        </>}
        {error && <p role="alert" className="mt-4 text-red-300">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" disabled={busy} onClick={closeDialog} className="rounded-lg border border-stone-600 px-4 py-2 disabled:opacity-50">Quay lại</button>
          <button type="button" disabled={busy} onClick={() => void (confirmCancel ? cancelOrder() : pay())}
            className={`rounded-lg px-4 py-2 font-semibold disabled:opacity-50 ${confirmCancel ? 'bg-red-600 text-white' : 'bg-amber-500 text-stone-950'}`}>
            {busy ? 'Đang xử lý…' : confirmCancel ? 'Xác nhận hủy đơn' : details?.config.provider === 'MOCK' ? 'Xác nhận thanh toán mô phỏng' : 'Mở trang thanh toán'}
          </button>
        </div>
      </dialog>
    </div>
  );
}

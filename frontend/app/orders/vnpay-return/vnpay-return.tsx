'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import { cartSignature, completePaidCheckout, isPaidOrderStatus } from '@/lib/checkout-session';
import { useCart } from '@/store/cart';

type PaymentStatus = { orderId: number; orderStatus: string; paymentStatus: string };

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}
function tokenSnapshot() { return localStorage.getItem('token'); }
function serverTokenSnapshot(): null { return null; }

export default function VnpayReturn() {
  const params = useSearchParams();
  const txnRef = params.get('vnp_TxnRef') ?? '';
  const validRef = txnRef.length <= 200 && /^\d+_\d+_\d+$/.test(txnRef);
  const token = useSyncExternalStore(subscribe, tokenSnapshot, serverTokenSnapshot);
  const cartHydrated = useSyncExternalStore(
    callback => useCart.persist.onFinishHydration(callback),
    () => useCart.persist.hasHydrated(),
    () => false,
  );
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['vnpay-return', txnRef, token],
    queryFn: async () => {
      const result = await api<PaymentStatus>(`/payments/vnpay/status/${encodeURIComponent(txnRef)}`);
      if (!Number.isSafeInteger(result.orderId) || result.orderId <= 0) throw new Error('Phản hồi giao dịch không hợp lệ.');
      return result;
    },
    enabled: Boolean(token && validRef),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    // Wait up to one minute for IPN, then allow explicit refresh. A timeout
    // never means that the gateway definitely rejected a payment.
    refetchInterval: query => query.state.data?.paymentStatus === 'PENDING' &&
      query.state.dataUpdateCount < 20 ? 3000 : false,
  });
  const paid = Boolean(data && isPaidOrderStatus(data.orderStatus));

  useEffect(() => {
    if (!paid || !data || !token || !cartHydrated) return;
    completePaidCheckout(token, data.orderId, cartSignature(useCart.getState().items), useCart.getState().clear);
  }, [paid, data, token, cartHydrated]);

  let title = 'Đang xác minh thanh toán VNPay';
  let message = 'Đang đọc trạng thái giao dịch từ máy chủ.';
  if (!validRef) {
    title = 'Không xác định được giao dịch';
    message = 'Đường dẫn thiếu mã giao dịch hợp lệ. Vui lòng kiểm tra trong lịch sử đơn.';
  } else if (!token) {
    title = 'Đăng nhập để kiểm tra thanh toán';
    message = 'Cần tài khoản sở hữu đơn để đọc kết quả từ máy chủ.';
  } else if (error) {
    title = 'Chưa xác minh được thanh toán';
    message = error instanceof Error ? error.message : 'Không thể đọc trạng thái giao dịch.';
  } else if (data) {
    if (paid) {
      title = 'Thanh toán thành công';
      message = data.paymentStatus === 'SUCCEEDED'
        ? 'Đơn đã được hệ thống xác nhận thanh toán.'
        : 'Đơn đã được xác nhận thanh toán ở một lần thử khác.';
    } else if (data.orderStatus === 'REFUNDED' || data.paymentStatus === 'REFUNDED') {
      title = 'Giao dịch đã được hoàn tiền';
      message = 'Bạn có thể xem thông tin đơn trong lịch sử.';
    } else if (data.paymentStatus === 'SUCCEEDED') {
      title = 'Giao dịch cần được kiểm tra';
      message = 'Đã ghi nhận thanh toán nhưng đơn chưa thể xử lý. Vui lòng liên hệ cửa hàng kèm mã đơn.';
    } else if (data.orderStatus === 'CANCELLED') {
      title = 'Đơn hàng đã hủy';
      message = 'Đơn này không còn chờ thanh toán. Vui lòng kiểm tra lịch sử trước khi đặt lại.';
    } else if (data.paymentStatus === 'FAILED') {
      title = 'Thanh toán chưa thành công';
      message = 'Bạn có thể mở đơn để thử lại trên chính đơn này.';
    } else {
      title = 'Đang chờ xác nhận từ VNPay';
      message = 'Hệ thống chưa nhận được kết quả cuối cùng. Bạn có thể cập nhật trạng thái hoặc xem lại đơn sau.';
    }
  }

  return (
    <main className="max-w-lg mx-auto py-16 px-4 text-center">
      <div className="bg-stone-900 border border-stone-800 rounded-3xl p-8">
        <div aria-hidden="true" className={`text-5xl mb-5 ${paid && !error ? 'text-emerald-400' : 'text-amber-400'}`}>
          {paid && !error ? '✓' : '⌛'}
        </div>
        <h1 className="text-2xl font-serif font-bold text-stone-100 mb-3">{title}</h1>
        <p role={error ? 'alert' : 'status'} className="text-sm text-stone-400 mb-7">{message}</p>
        {data && <p className="mb-5 text-amber-300">Đơn #{data.orderId}</p>}
        <div className="flex flex-wrap gap-3 justify-center">
          <Link href="/orders" className="px-4 py-2 rounded-xl bg-stone-800 text-stone-200">Lịch sử đơn</Link>
          {validRef && !token && <Link href="/login" className="px-4 py-2 rounded-xl bg-amber-500 text-stone-950">Đăng nhập</Link>}
          {data && <Link href={`/orders/${data.orderId}/confirmed`} className="px-4 py-2 rounded-xl bg-amber-500 text-stone-950 font-semibold">Xem đơn hàng</Link>}
          {validRef && token && !paid && <button type="button" onClick={() => void refetch()}
            disabled={isFetching || isPending && !error}
            className="px-4 py-2 rounded-xl border border-stone-600 text-stone-200 disabled:opacity-50">
            {isFetching ? 'Đang cập nhật…' : 'Cập nhật trạng thái'}
          </button>}
        </div>
      </div>
    </main>
  );
}

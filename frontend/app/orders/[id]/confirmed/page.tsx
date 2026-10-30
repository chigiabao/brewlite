// FIX07 — Xác nhận dựa trên trạng thái thật của GET /orders/:id (JWT + ownership ở backend).
'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import { isPaidOrderStatus } from '@/lib/checkout-session';

type OrderDetail = {
  id: number;
  status: string;
  total: number;
  createdAt: string;
};

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}
function tokenSnapshot() { return localStorage.getItem('token'); }
function serverTokenSnapshot(): null { return null; }

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ thanh toán', PAYMENT_FAILED: 'Thanh toán thất bại',
  PAID: 'Đã thanh toán', PREPARING: 'Đang pha chế',
  READY: 'Sẵn sàng nhận', COMPLETED: 'Đã nhận món', CANCELLED: 'Đã hủy',
};

export default function ConfirmedPage() {
  const { id } = useParams<{ id: string }>();
  const token = useSyncExternalStore(subscribe, tokenSnapshot, serverTokenSnapshot);
  const orderId = Number(id);
  const validId = Number.isSafeInteger(orderId) && orderId > 0;
  const { data: order, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['confirmed-order', id, token],
    queryFn: () => api<OrderDetail>(`/orders/${orderId}`),
    enabled: Boolean(token && validId),
    retry: 1,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const paid = Boolean(order && isPaidOrderStatus(order.status));
  const label = order ? (STATUS_LABEL[order.status] ?? order.status) : '';

  return (
    <div className="max-w-lg mx-auto py-12 px-4">
      <div className="bg-stone-900/90 border border-stone-800 rounded-3xl p-8 text-center shadow-2xl backdrop-blur-xl">
        {!validId ? (
          <h1 className="text-xl font-bold text-red-300">Mã đơn hàng không hợp lệ</h1>
        ) : !token ? (
          <>
            <h1 className="text-xl font-bold text-stone-100 mb-3">Đăng nhập để xem đơn hàng</h1>
            <p className="text-sm text-stone-400 mb-5">Trạng thái chỉ hiển thị sau khi xác thực tài khoản sở hữu đơn.</p>
            <Link className="text-amber-400 underline" href="/login">Đăng nhập</Link>
          </>
        ) : isLoading ? (
          <p role="status" className="text-stone-300">Đang xác minh trạng thái đơn hàng với máy chủ…</p>
        ) : error || !order || order.id !== orderId ? (
          <>
            <h1 className="text-xl font-bold text-red-300 mb-3">Không thể xác nhận đơn hàng</h1>
            <p role="alert" className="text-sm text-stone-400 mb-5">
              {error instanceof Error ? error.message : 'Đơn không tồn tại hoặc không thuộc tài khoản hiện tại.'}
            </p>
            <button onClick={() => void refetch()} className="px-4 py-2 bg-stone-700 text-stone-100 rounded-xl">Thử tải lại</button>
          </>
        ) : (
          <>
            <div className={`w-20 h-20 rounded-full flex justify-center items-center mx-auto mb-6 text-4xl ${paid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
              {paid ? '✓' : '⌛'}
            </div>
            <h1 className="text-2xl font-serif font-bold text-stone-100 mb-2">
              {paid ? 'Thanh Toán Thành Công!' : 'Đơn Hàng Chưa Thanh Toán Thành Công'}
            </h1>
            <p className="text-sm text-stone-400 mb-6">
              {paid ? 'Trạng thái đã được xác minh từ hệ thống BrewLite.' : 'Đây là trạng thái thực của đơn từ máy chủ, không phải thông báo mặc định.'}
            </p>
            <div className="bg-stone-950/80 border border-stone-800/80 rounded-2xl p-5 mb-6 text-left space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-stone-400">Mã đơn</span><strong className="text-amber-400">#{order.id}</strong></div>
              <div className="flex justify-between"><span className="text-stone-400">Trạng thái</span><strong className={paid ? 'text-emerald-400' : 'text-amber-400'}>{label} ({order.status})</strong></div>
              <div className="flex justify-between"><span className="text-stone-400">Số tiền đơn</span><strong className="text-stone-100">{order.total.toLocaleString('vi-VN')}đ</strong></div>
              {order.status === 'READY' && <p className="text-emerald-400">Đồ uống đã sẵn sàng. Mời tới quầy nhận món.</p>}
              {order.status === 'PAID' && <p className="text-stone-400">Đã thanh toán; cửa hàng sẽ chuẩn bị đồ uống.</p>}
              {order.status === 'PREPARING' && <p className="text-stone-400">Đồ uống đang được chuẩn bị.</p>}
              {order.status === 'PENDING' && <p className="text-amber-300">Đơn đang chờ thanh toán; vui lòng kiểm tra phiên checkout.</p>}
              {order.status === 'PAYMENT_FAILED' && <p className="text-red-300">Có thể thử thanh toán lại tại Checkout nếu còn phiên giỏ hàng.</p>}
            </div>
            {(order.status === 'PENDING' || order.status === 'PAYMENT_FAILED') && (
              <Link href="/checkout" className="block text-amber-400 underline text-sm mb-3">Quay lại Checkout để tiếp tục thanh toán</Link>
            )}
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="px-4 py-2 rounded-xl border border-stone-700 text-amber-400 text-sm mb-4 disabled:opacity-50"
            >{isFetching ? 'Đang cập nhật…' : 'Cập nhật trạng thái'}</button>
          </>
        )}
        <div className="flex flex-col sm:flex-row gap-3 mt-5">
          <Link href="/orders" className="flex-1 py-3 px-4 rounded-xl bg-stone-800 text-stone-200 text-sm font-semibold">📋 Lịch sử đơn</Link>
          <Link href="/" className="flex-1 py-3 px-4 rounded-xl bg-amber-500 text-stone-950 text-sm font-bold">☕ Về thực đơn</Link>
        </div>
      </div>
    </div>
  );
}

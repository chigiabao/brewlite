// Trang lịch sử đơn hàng. Người phụ trách: F (Task 9 UI), E sở hữu API dữ liệu.
'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { api } from '@/lib/api';

type Order = {
  id: number;
  status: string;
  total: number;
  createdAt: string;
  subtotal?: number;
  discountTotal?: number;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; border: string; bg: string }> = {
  PAID: {
    label: 'Đã thanh toán',
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
  },
  PREPARING: {
    label: 'Đang pha chế',
    color: 'text-sky-400',
    border: 'border-sky-500/30',
    bg: 'bg-sky-500/10',
  },
  READY: {
    label: 'Đã sẵn sàng',
    color: 'text-purple-400',
    border: 'border-purple-500/30',
    bg: 'bg-purple-500/10',
  },
  COMPLETED: {
    label: 'Đã hoàn tất',
    color: 'text-stone-300',
    border: 'border-stone-700',
    bg: 'bg-stone-800/50',
  },
  PENDING: {
    label: 'Chờ thanh toán',
    color: 'text-amber-400',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
  },
  PAYMENT_FAILED: {
    label: 'Thanh toán lỗi',
    color: 'text-red-400',
    border: 'border-red-500/30',
    bg: 'bg-red-500/10',
  },
  CANCELLED: {
    label: 'Đã hủy',
    color: 'text-stone-500',
    border: 'border-stone-800',
    bg: 'bg-stone-900',
  },
};

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

export default function OrdersPage() {
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const { data, isLoading, error } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api<Order[]>('/orders/me'),
    enabled: Boolean(token),
  });

  if (!token) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-8 shadow-xl">
          <span className="text-4xl block mb-4">🔒</span>
          <h1 className="text-xl font-serif font-bold text-stone-100 mb-2">Đăng Nhập Để Xem Lịch Sử</h1>
          <p className="text-sm text-stone-400 mb-6">
            Lịch sử đơn hàng được lưu theo tài khoản đã xác thực JWT của bạn.
          </p>
          <Link
            href="/login"
            className="inline-block w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm transition"
          >
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between pb-6 mb-6 border-b border-stone-800">
        <div>
          <h1 className="text-2xl font-serif font-bold text-stone-100">Lịch Sử Đơn Hàng</h1>
          <p className="text-xs text-stone-400 mt-1">
            Theo dõi trạng thái đơn hàng của bạn theo thời gian thực (GET /orders/me)
          </p>
        </div>
        <Link
          href="/"
          className="text-xs text-amber-400 hover:text-amber-300 font-semibold border border-amber-500/30 px-3 py-1.5 rounded-lg transition"
        >
          + Đặt món mới
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-stone-900 border border-stone-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-center">
          <p className="text-sm text-red-300 mb-2">Không thể tải danh sách đơn hàng.</p>
          <p className="text-xs text-stone-400">{(error as Error).message}</p>
        </div>
      ) : !data?.length ? (
        <div className="text-center py-16 bg-stone-900/60 border border-stone-800/80 rounded-2xl p-8">
          <span className="text-4xl block mb-3">☕</span>
          <h2 className="text-lg font-serif font-bold text-stone-200 mb-2">Chưa Có Đơn Hàng Nào</h2>
          <p className="text-sm text-stone-400 mb-6">
            Hãy chọn các món cà phê đặc sản từ thực đơn và trải nghiệm thanh toán không tiền mặt.
          </p>
          <Link
            href="/"
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 font-bold text-sm inline-block shadow-lg shadow-amber-500/20"
          >
            Khám phá thực đơn
          </Link>
        </div>
      ) : (
        <div className="space-y-3.5">
          {data.map((order) => {
            const statusInfo = STATUS_CONFIG[order.status] ?? {
              label: order.status,
              color: 'text-stone-300',
              border: 'border-stone-700',
              bg: 'bg-stone-800',
            };

            return (
              <div
                key={order.id}
                className="bg-stone-900/90 border border-stone-800/90 hover:border-stone-700 rounded-2xl p-5 shadow-lg transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-amber-400 text-base">
                      Đơn #{order.id}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusInfo.bg} ${statusInfo.color} ${statusInfo.border}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>
                  <div className="text-xs text-stone-400 mt-1.5 flex items-center gap-2">
                    <span>🕒 {new Date(order.createdAt).toLocaleString('vi-VN')}</span>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 border-stone-800/60 pt-3 sm:pt-0">
                  <div className="text-lg font-mono font-bold text-stone-100">
                    {order.total.toLocaleString('vi-VN')}đ
                  </div>
                  {order.status === 'PAID' && (
                    <span className="text-[11px] text-emerald-400 font-medium">✓ Đã thanh toán thẻ/ví</span>
                  )}
                  {order.status === 'PAYMENT_FAILED' && (
                    <span className="text-[11px] text-red-400 font-medium">Cần thanh toán lại</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Trang xác nhận đơn hàng thành công (Wireframe 5 & Task 9).
'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { clearAttempt } from '@/app/checkout/checkout-recovery';
import { useCart } from '@/store/cart';

type OrderSummary = { id: number; status: string };

const MAX_POLLS = 10;

export default function ConfirmedPage() {
  const { id } = useParams<{ id: string }>();
  const clear = useCart((s) => s.clear);
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    clear();
    clearAttempt();
  }, [clear]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;

    const check = async () => {
      polls += 1;
      try {
        const orders = await api<OrderSummary[]>('/orders/me');
        const current = orders.find((order) => String(order.id) === String(id));
        if (!stopped) {
          setStatus(current?.status ?? null);
          if (current?.status === 'PAID' || polls >= MAX_POLLS) {
            setChecking(false);
            return;
          }
        }
      } catch {
        if (!stopped && polls >= MAX_POLLS) {
          setChecking(false);
          return;
        }
      }

      if (!stopped) timer = setTimeout(check, 1500);
    };

    void check();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  const paid = status === 'PAID';
  const failed = status === 'PAYMENT_FAILED' || status === 'CANCELLED';

  return (
    <div className="max-w-lg mx-auto py-12 px-4">
      <div className="bg-stone-900/90 border border-stone-800 rounded-3xl p-8 text-center shadow-2xl backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/10 blur-3xl pointer-events-none rounded-full" />

        <div
          className={`w-20 h-20 rounded-full border-2 flex items-center justify-center mx-auto mb-6 text-4xl shadow-lg ${
            paid
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-emerald-500/20'
              : failed
                ? 'bg-red-500/20 border-red-500/50 text-red-400 shadow-red-500/20'
                : 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-amber-500/20'
          }`}
        >
          {paid ? '✓' : failed ? '!' : '…'}
        </div>

        <span
          className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border mb-3 uppercase tracking-wider ${
            paid
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : failed
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
          }`}
        >
          {paid ? 'Giao dịch hoàn tất' : failed ? 'Thanh toán chưa hoàn tất' : 'Đang xác nhận thanh toán'}
        </span>

        <h1 className="text-3xl font-serif font-bold text-stone-100 mb-2">
          {paid ? 'Đặt Hàng Thành Công!' : failed ? 'Chưa thể xác nhận đơn' : 'Đang xác nhận thanh toán'}
        </h1>
        <p className="text-sm text-stone-400 max-w-sm mx-auto mb-6">
          {paid
            ? 'Cảm ơn quý khách đã sử dụng phương thức đặt và thanh toán không tiền mặt của BrewLite.'
            : checking
              ? 'Stripe đã chuyển bạn về đây. Hệ thống đang chờ webhook xác nhận thanh toán.'
              : 'Chưa xác nhận được thanh toán. Vui lòng kiểm tra lại lịch sử đơn hàng.'}
        </p>

        <div className="bg-stone-950/80 border border-stone-800/80 rounded-2xl p-5 mb-6 text-left space-y-3">
          <div className="flex justify-between items-center text-sm border-b border-stone-800/60 pb-2.5">
            <span className="text-stone-400">Mã đơn hàng</span>
            <span className="font-mono font-bold text-amber-400 text-base">#{id}</span>
          </div>

          <div className="flex justify-between items-center text-sm border-b border-stone-800/60 pb-2.5">
            <span className="text-stone-400">Trạng thái đơn hàng</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                paid
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : failed
                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}
            >
              {status ?? 'ĐANG XÁC NHẬN'}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-stone-400">Hướng dẫn nhận món</span>
            <span className="font-semibold text-stone-200">Mời tới quầy lấy nước</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-xs mb-8 flex items-center gap-3 text-left">
          <span className="text-2xl">☕</span>
          <div>
            <div className="font-bold">Barista đang chuẩn bị đồ uống của bạn</div>
            <div className="text-stone-400 mt-0.5">Vui lòng theo dõi mã #{id} trên bảng điện tử tại quầy pha chế.</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/orders"
            className="flex-1 py-3 px-4 rounded-xl border border-stone-700 bg-stone-800/60 hover:bg-stone-800 text-stone-200 font-semibold text-sm transition text-center"
          >
            📋 Xem lịch sử đơn
          </Link>
          <Link
            href="/"
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-bold text-sm transition text-center shadow-lg shadow-amber-500/20"
          >
            ☕ Về trang thực đơn
          </Link>
        </div>
      </div>
    </div>
  );
}

// Trang xác nhận đơn hàng thành công (Wireframe 5 & Task 9).
'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function ConfirmedPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="max-w-lg mx-auto py-12 px-4">
      <div className="bg-stone-900/90 border border-stone-800 rounded-3xl p-8 text-center shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/10 blur-3xl pointer-events-none rounded-full" />

        {/* Checkmark Icon */}
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center mx-auto mb-6 text-emerald-400 text-4xl shadow-lg shadow-emerald-500/20">
          ✓
        </div>

        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3 uppercase tracking-wider">
          Giao dịch hoàn tất
        </span>

        <h1 className="text-3xl font-serif font-bold text-stone-100 mb-2">
          Đặt Hàng Thành Công!
        </h1>
        <p className="text-sm text-stone-400 max-w-sm mx-auto mb-6">
          Cảm ơn quý khách đã sử dụng phương thức đặt và thanh toán không tiền mặt của BrewLite.
        </p>

        {/* Thông tin đơn hàng (Wireframe 5) */}
        <div className="bg-stone-950/80 border border-stone-800/80 rounded-2xl p-5 mb-6 text-left space-y-3">
          <div className="flex justify-between items-center text-sm border-b border-stone-800/60 pb-2.5">
            <span className="text-stone-400">Mã đơn hàng</span>
            <span className="font-mono font-bold text-amber-400 text-base">#{id}</span>
          </div>

          <div className="flex justify-between items-center text-sm border-b border-stone-800/60 pb-2.5">
            <span className="text-stone-400">Trạng thái đơn hàng</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              PAID (Đã thanh toán)
            </span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-stone-400">Hướng dẫn nhận món</span>
            <span className="font-semibold text-stone-200">Mời tới quầy lấy nước</span>
          </div>
        </div>

        {/* Thông báo tiến độ pha chế */}
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-xs mb-8 flex items-center gap-3 text-left">
          <span className="text-2xl">☕</span>
          <div>
            <div className="font-bold">Barista đang chuẩn bị đồ uống của bạn</div>
            <div className="text-stone-400 mt-0.5">Vui lòng theo dõi mã #{id} trên bảng điện tử tại quầy pha chế.</div>
          </div>
        </div>

        {/* Nút điều hướng */}
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

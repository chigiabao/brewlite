'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function VnpayReturnPage() {
  const params = useSearchParams();
  const responseCode = params.get('vnp_ResponseCode');
  const transactionStatus = params.get('vnp_TransactionStatus');
  const success = responseCode === '00' && transactionStatus === '00';

  return (
    <main className="max-w-lg mx-auto py-16 px-4 text-center">
      <div className="bg-stone-900 border border-stone-800 rounded-3xl p-8">
        <div className={`text-5xl mb-5 ${success ? 'text-emerald-400' : 'text-red-400'}`}>
          {success ? '✓' : '×'}
        </div>
        <h1 className="text-2xl font-serif font-bold text-stone-100 mb-3">
          {success ? 'Thanh toán VNPAY thành công' : 'Thanh toán chưa hoàn tất'}
        </h1>
        <p className="text-sm text-stone-400 mb-7">
          {success
            ? 'Hệ thống đang xác nhận trạng thái đơn hàng từ VNPAY.'
            : 'Bạn có thể quay lại Checkout để thử thanh toán lại.'}
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/orders" className="px-4 py-2 rounded-xl bg-stone-800 text-stone-200">
            Lịch sử đơn
          </Link>
          {!success && (
            <Link href="/checkout" className="px-4 py-2 rounded-xl bg-amber-500 text-stone-950 font-semibold">
              Thử lại
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

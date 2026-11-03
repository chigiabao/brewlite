import { Suspense } from 'react';
import VnpayReturn from './vnpay-return';

export default function VnpayReturnPage() {
  return <Suspense fallback={<p className="p-12 text-center">Đang tải kết quả thanh toán…</p>}>
    <VnpayReturn />
  </Suspense>;
}

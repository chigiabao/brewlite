// Trang xác nhận đơn. Người phụ trách: F (Task 9).
'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function ConfirmedPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow text-center">
      <div className="text-5xl text-green-500 mb-4">✓</div>
      <h1 className="text-xl font-bold">Đặt hàng thành công!</h1>
      <p className="mt-2">Mã đơn: #{id}</p>
      <p className="text-gray-500">Trạng thái: PAID</p>
      <p className="mt-4">Mời tới quầy lấy nước</p>
      <Link
        href="/"
        className="inline-block mt-6 bg-amber-600 text-white px-6 py-2 rounded hover:bg-amber-700"
      >
        Về trang chủ
      </Link>
    </div>
  );
}

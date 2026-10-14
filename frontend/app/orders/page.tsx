// Trang lịch sử đơn. Người phụ trách: F (Task 9).
'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Order = { id: number; status: string; total: number; createdAt: string };

export default function OrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api<Order[]>('/orders/me'),
  });

  if (isLoading) return <p className="py-8">Đang tải…</p>;

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-4">Lịch sử đơn hàng</h1>
      {!data?.length ? (
        <p>Chưa có đơn nào.</p>
      ) : (
        <ul className="space-y-3">
          {data.map((o) => (
            <li key={o.id} className="bg-white p-4 rounded shadow flex justify-between">
              <div>
                <div className="font-semibold">Đơn #{o.id}</div>
                <div className="text-sm text-gray-500">
                  {new Date(o.createdAt).toLocaleString('vi-VN')}
                </div>
              </div>
              <div className="text-right">
                <div className="text-amber-700 font-bold">
                  {o.total.toLocaleString('vi-VN')}đ
                </div>
                <div className="text-sm">{o.status}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

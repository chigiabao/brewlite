// Trang Menu. Người phụ trách: B (Task 3).
'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

type Product = { id: number; name: string; price: number; imageUrl: string };

export default function MenuPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['products'],
    queryFn: () => api<Product[]>('/products'),
  });

  if (isLoading) return <p className="text-center py-8">Đang tải menu…</p>;
  if (error) return <p className="text-center py-8 text-red-600">Không tải được menu.</p>;
  if (!data?.length) return <p className="text-center py-8">Hiện chưa có sản phẩm.</p>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {data.map((p) => (
        <Link
          key={p.id}
          href={`/products/${p.id}`}
          className="border rounded-lg p-3 bg-white hover:shadow transition"
        >
          <img
            src={p.imageUrl}
            alt={p.name}
            className="h-32 w-full object-cover rounded bg-gray-200"
          />
          <div className="font-semibold mt-2">{p.name}</div>
          <div className="text-amber-700">{p.price.toLocaleString('vi-VN')}đ</div>
        </Link>
      ))}
    </div>
  );
}

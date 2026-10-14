// Trang chi tiết sản phẩm. Người phụ trách: B (Task 4).
'use client';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Size, unitPrice } from '@/lib/pricing';
import { useCart } from '@/store/cart';

type Product = { id: number; name: string; price: number; imageUrl: string; stock: number };

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: p, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api<Product>(`/products/${id}`),
  });
  const [size, setSize] = useState<Size>('M');
  const [toppings, setToppings] = useState<string[]>([]);
  const add = useCart((s) => s.add);
  const [added, setAdded] = useState(false);

  if (isLoading || !p) return <p className="py-8">Đang tải…</p>;

  const price = unitPrice(p.price, size, toppings);

  const toggleTopping = (t: string) =>
    setToppings((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));

  const handleAdd = () => {
    add({ productId: p.id, name: p.name, size, toppings, unitPrice: price, qty: 1 });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow">
      <img src={p.imageUrl} alt={p.name} className="h-48 w-full object-cover rounded bg-gray-200" />
      <h1 className="text-2xl font-bold mt-4">{p.name}</h1>
      <p className="text-amber-700 text-lg">{price.toLocaleString('vi-VN')}đ</p>

      <div className="mt-4">
        <div className="font-semibold mb-1">Size</div>
        <div className="flex gap-2">
          {(['S', 'M', 'L'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={`px-4 py-1 border rounded ${size === s ? 'bg-amber-700 text-white' : ''}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="font-semibold mb-1">Topping</div>
        <div className="flex gap-2 flex-wrap">
          {['Trân châu', 'Kem'].map((t) => (
            <button
              key={t}
              onClick={() => toggleTopping(t)}
              className={`px-3 py-1 border rounded ${toppings.includes(t) ? 'bg-amber-700 text-white' : ''}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleAdd}
        className="mt-6 w-full bg-amber-600 text-white py-2 rounded hover:bg-amber-700 transition"
      >
        {added ? '✓ Đã thêm' : 'Thêm vào giỏ'}
      </button>
    </div>
  );
}

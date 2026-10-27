'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getProducts } from '@/lib/products-api';

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300' fill='%23F3F4F6'><rect width='400' height='300' fill='%23F3F4F6'/><path d='M160 110h80v70a40 40 0 0 1-40 40 40 40 0 0 1-40-40v-70Z' stroke='%239CA3AF' stroke-width='6' fill='%23E5E7EB'/><path d='M240 130h16a16 16 0 0 1 16 16v8a16 16 0 0 1-16 16h-16' stroke='%239CA3AF' stroke-width='6' fill='none'/><path d='M175 85c0-10 10-15 10-25M200 85c0-10 10-15 10-25M225 85c0-10 10-15 10-25' stroke='%23D1D5DB' stroke-width='4' stroke-linecap='round'/><text x='50%25' y='260' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%239CA3AF' font-weight='600'>BrewLite Coffee</text></svg>";

export default function MenuPage() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
  });

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-gray-600 font-medium">Đang tải menu...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-red-600 font-semibold mb-4">Không tải được menu</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-4 py-2 bg-amber-700 text-white rounded-md hover:bg-amber-800 transition"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Hiện chưa có sản phẩm.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Menu đồ uống</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {data.map((product) => (
          <div
            key={product.id}
            className="group border border-gray-200 rounded-lg p-4 bg-white hover:shadow-lg transition flex flex-col justify-between"
          >
            <Link href={`/products/${product.id}`} className="block">
              <div className="relative overflow-hidden rounded-md bg-gray-100 mb-3 h-40">
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = PLACEHOLDER_IMG;
                  }}
                />
                {product.stock <= 0 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded">
                      Hết hàng
                    </span>
                  </div>
                )}
              </div>
              <h2 className="font-semibold text-gray-900 group-hover:text-amber-800 transition line-clamp-1">
                {product.name}
              </h2>
              <div className="text-amber-700 font-bold mt-2">
                {product.price.toLocaleString('vi-VN')}đ
              </div>
            </Link>

            <div className="mt-4 pt-2 border-t border-gray-100 flex items-center justify-between">
              {product.stock <= 0 ? (
                <span className="text-xs text-red-500 font-medium">Hết hàng</span>
              ) : (
                <span className="text-xs text-emerald-600 font-medium">Còn hàng</span>
              )}
              <Link
                href={`/products/${product.id}`}
                className="text-xs font-semibold text-amber-700 hover:text-amber-900 hover:underline"
              >
                Chi tiết →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'BrewLite',
  description: 'Đặt cà phê không dùng tiền mặt',
};

// TODO(C – Task 5): thêm badge số lượng giỏ hàng lên header (lấy từ useCart).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen flex flex-col bg-gray-50">
        <Providers>
          <header className="bg-amber-800 text-white p-4 flex items-center justify-between">
            <Link href="/" className="text-xl font-bold">
              ☕ BrewLite
            </Link>
            <nav className="flex gap-4">
              <Link href="/cart" className="hover:underline">
                Giỏ hàng
              </Link>
              <Link href="/orders" className="hover:underline">
                Lịch sử đơn
              </Link>
              <Link href="/login" className="hover:underline">
                Đăng nhập
              </Link>
              {/* TODO(D – Task 7): đổi thành Đăng xuất khi đã có token */}
            </nav>
          </header>
          <main className="flex-1 p-4">
            <Suspense fallback={<p className="py-8 text-center">Đang tải…</p>}>{children}</Suspense>
          </main>
        </Providers>
      </body>
    </html>
  );
}

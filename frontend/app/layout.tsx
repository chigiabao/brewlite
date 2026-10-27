import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import './globals.css';
import Providers from './providers';

import { CartLink } from '@/components/cart-link';
import { AuthHeader } from '@/components/auth-header';

export const metadata: Metadata = {
  title: 'BrewLite',
  description: 'Đặt cà phê không dùng tiền mặt',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen flex flex-col bg-gray-50">
        <Providers>
          <header className="bg-amber-800 text-white p-4 flex items-center justify-between">
            <Link href="/" className="text-xl font-bold">
              ☕ BrewLite
            </Link>
            <nav className="flex gap-4 items-center">
              <CartLink />
              <Link href="/orders" className="hover:underline">
                Lịch sử đơn
              </Link>
              <AuthHeader />
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

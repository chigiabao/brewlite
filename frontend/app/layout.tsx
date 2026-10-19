import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import './globals.css';
import { CartLink } from '@/components/cart-link';

export const metadata: Metadata = {
  title: 'BrewLite Coffee',
  description: 'Thưởng thức cà phê hảo hạng, đặt hàng nhanh chóng không dùng tiền mặt',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        <header className="site-header">
          <div className="header-inner">
            <Link href="/" className="brand-logo">
              <span>☕</span>
              <span>BrewLite</span>
            </Link>
            <nav className="main-nav">
              <Link href="/" className="nav-link">
                Menu
              </Link>
              <Link href="/orders" className="nav-link">
                Lịch sử đơn
              </Link>
              <Link href="/login" className="nav-link">
                Đăng nhập
              </Link>
              <CartLink />
            </nav>
          </div>
        </header>

        <main className="site-main">
          <Suspense fallback={<p style={{ textAlign: 'center', padding: '2rem' }}>Đang tải...</p>}>
            {children}
          </Suspense>
        </main>

        <footer className="site-footer">
          <p>© 2026 BrewLite Coffee. All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
}

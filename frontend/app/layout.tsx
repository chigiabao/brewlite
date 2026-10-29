import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import './globals.css';
import Providers from './providers';

import { CartLink } from '@/components/cart-link';
import { AuthHeader } from '@/components/auth-header';

export const metadata: Metadata = {
  title: 'BrewLite Coffee | Hương Vị Cà Phê Mộc Nguyên Bản',
  description: 'Thương hiệu cà phê mộc thủ công cao cấp. Đặt món nhanh chóng, giao tận nơi, thanh toán không dùng tiền mặt.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="scroll-smooth">
      <body className="min-h-screen flex flex-col bg-[#FAF9F6] text-stone-900 selection:bg-amber-800 selection:text-white">
        <Providers>
          {/* Top Announcement Bar */}
          <div className="bg-gradient-to-r from-amber-950 via-stone-900 to-amber-950 text-amber-200/90 text-xs py-2 px-4 text-center font-medium border-b border-amber-900/40 flex items-center justify-center gap-2">
            <span className="inline-block animate-pulse">✨</span>
            <span>
              ƯU ĐÃI TUẦN NÀY: <strong>MIỄN PHÍ GIAO HÀNG</strong> CHO ĐƠN TỪ 99K • NHẬP MÃ <strong>BREWNEW</strong> GIẢM 15%
            </span>
          </div>

          {/* Sticky Header */}
          <header className="sticky top-0 z-50 backdrop-blur-md bg-stone-950/95 border-b border-amber-900/30 text-white shadow-lg shadow-black/10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
              {/* Brand Logo */}
              <Link href="/" className="flex items-center gap-3 group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-700 via-amber-500 to-amber-300 p-0.5 shadow-md shadow-amber-950/50 group-hover:scale-105 transition-all duration-300">
                  <div className="w-full h-full bg-stone-950 rounded-[10px] flex items-center justify-center">
                    <span className="text-xl">☕</span>
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-2xl font-black tracking-tight bg-gradient-to-r from-amber-100 via-amber-300 to-amber-100 bg-clip-text text-transparent">
                    BrewLite
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-amber-400/80 font-bold -mt-1">
                    Artisan Roastery
                  </span>
                </div>
              </Link>

              {/* Navigation Links */}
              <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-stone-300">
                <Link
                  href="/"
                  className="hover:text-amber-400 transition-colors"
                >
                  Trang chủ
                </Link>
                <Link
                  href="/#menu"
                  className="hover:text-amber-400 transition-colors"
                >
                  Thực đơn
                </Link>
                <Link
                  href="/orders"
                  className="hover:text-amber-400 transition-colors"
                >
                  Lịch sử đơn
                </Link>
              </nav>

              {/* Header Right Actions */}
              <div className="flex items-center gap-3.5">
                <CartLink />
                <AuthHeader />
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 w-full">
            <Suspense
              fallback={
                <div className="py-20 flex flex-col items-center justify-center text-amber-800">
                  <div className="w-10 h-10 border-4 border-amber-800/20 border-t-amber-800 rounded-full animate-spin mb-3"></div>
                  <p className="text-sm font-medium">Đang tải trải nghiệm BrewLite…</p>
                </div>
              }
            >
              {children}
            </Suspense>
          </main>

          {/* Luxury E-commerce Footer */}
          <footer className="bg-stone-950 text-stone-300 pt-16 pb-8 border-t border-amber-900/40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
                {/* Col 1: Brand Info */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-2xl">☕</span>
                    <span className="text-2xl font-black text-white">BrewLite</span>
                  </div>
                  <p className="text-stone-400 text-sm leading-relaxed mb-6">
                    Mỗi tách cà phê là một tác phẩm nghệ thuật rang xay thủ công từ hạt Arabica & Robusta vùng cao nguyên Lâm Đồng, mang lại nguồn năng lượng thuần khiết.
                  </p>
                  <div className="flex items-center gap-3 text-stone-400 text-sm font-semibold">
                    <span className="px-2.5 py-1 rounded bg-stone-900 border border-stone-800 text-amber-400 text-xs">
                      100% Nguyên chất
                    </span>
                    <span className="px-2.5 py-1 rounded bg-stone-900 border border-stone-800 text-amber-400 text-xs">
                      Rang mộc chuẩn vị
                    </span>
                  </div>
                </div>

                {/* Col 2: Categories */}
                <div>
                  <h4 className="text-white text-base font-bold mb-4 uppercase tracking-wider text-xs">
                    Thực Đơn Nổi Bật
                  </h4>
                  <ul className="space-y-2.5 text-sm text-stone-400">
                    <li>
                      <Link href="/#menu" className="hover:text-amber-400 transition-colors">
                        Cà phê phin truyền thống
                      </Link>
                    </li>
                    <li>
                      <Link href="/#menu" className="hover:text-amber-400 transition-colors">
                        Espresso & Latte cao cấp
                      </Link>
                    </li>
                    <li>
                      <Link href="/#menu" className="hover:text-amber-400 transition-colors">
                        Trà trái cây thanh nhiệt
                      </Link>
                    </li>
                    <li>
                      <Link href="/#menu" className="hover:text-amber-400 transition-colors">
                        Cold Brew ủ chậm 16 tiếng
                      </Link>
                    </li>
                  </ul>
                </div>

                {/* Col 3: Support */}
                <div>
                  <h4 className="text-white text-base font-bold mb-4 uppercase tracking-wider text-xs">
                    Dịch Vụ & Hỗ Trợ
                  </h4>
                  <ul className="space-y-2.5 text-sm text-stone-400">
                    <li>
                      <span className="hover:text-amber-400 cursor-pointer transition-colors">
                        Giao hàng hỏa tốc trong 30 phút
                      </span>
                    </li>
                    <li>
                      <span className="hover:text-amber-400 cursor-pointer transition-colors">
                        Chính sách đổi trả và hoàn tiền
                      </span>
                    </li>
                    <li>
                      <span className="hover:text-amber-400 cursor-pointer transition-colors">
                        Chương trình hội viên thân thiết
                      </span>
                    </li>
                    <li>
                      <span className="hover:text-amber-400 cursor-pointer transition-colors">
                        Bảo mật thanh toán trực tuyến
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Col 4: Contact & Store */}
                <div>
                  <h4 className="text-white text-base font-bold mb-4 uppercase tracking-wider text-xs">
                    Hệ Thống Cửa Hàng
                  </h4>
                  <div className="space-y-3 text-sm text-stone-400">
                    <p className="flex items-start gap-2">
                      <span>📍</span>
                      <span>128 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <span>📞</span>
                      <strong className="text-amber-400">1900 8888 (07:00 - 22:30)</strong>
                    </p>
                    <p className="flex items-center gap-2">
                      <span>✉️</span>
                      <span>contact@brewlite.vn</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom Copyright */}
              <div className="pt-8 mt-8 border-t border-stone-800/80 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-stone-500">
                <p>© 2026 BrewLite Coffee Roasters. Tất cả quyền được bảo lưu.</p>
                <div className="flex items-center gap-4">
                  <span>Thanh toán tiện lợi không tiền mặt:</span>
                  <div className="flex gap-2 text-stone-400 font-bold">
                    <span className="px-2 py-0.5 bg-stone-900 rounded border border-stone-800 text-[10px]">VNPAY</span>
                    <span className="px-2 py-0.5 bg-stone-900 rounded border border-stone-800 text-[10px]">MOMO</span>
                    <span className="px-2 py-0.5 bg-stone-900 rounded border border-stone-800 text-[10px]">VISA</span>
                  </div>
                </div>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}


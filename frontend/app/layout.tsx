import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import Providers from './providers';
import { AppShell } from '@/components/app-shell';

export const metadata: Metadata = {
  title: 'BrewLite Coffee | Hương Vị Cà Phê Mộc Nguyên Bản',
  description: 'Thương hiệu cà phê mộc thủ công cao cấp. Đặt món nhanh chóng, giao tận nơi, thanh toán không dùng tiền mặt.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="scroll-smooth">
      <body className="min-h-screen flex flex-col bg-[#FAF9F6] text-stone-900 selection:bg-amber-800 selection:text-white">
        <Providers>
          <Suspense
            fallback={
              <div className="min-h-screen py-20 flex flex-col items-center justify-center text-amber-800">
                <div className="w-10 h-10 border-4 border-amber-800/20 border-t-amber-800 rounded-full animate-spin mb-3"></div>
                <p className="text-sm font-medium">Đang tải trải nghiệm BrewLite…</p>
              </div>
            }
          >
            <AppShell>{children}</AppShell>
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}

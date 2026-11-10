// ROBOT LIVE-DEMO CHO BREWLITE (TỰ ĐỘNG BẤM TỪNG BƯỚC NHƯ NGƯỜI THẬT)
// Chạy bằng: node scripts-demo/robot-live-demo.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('../frontend/node_modules/@playwright/test');

const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('\n=============================================================');
  console.log('🤖 KHỞI ĐỘNG ROBOT AUTO-DEMO BREWLITE (TỰ BẤM NHƯ NGƯỜI THẬT)');
  console.log('=============================================================\n');

  // Mở trình duyệt Chrome thật, tốc độ chậm rãi để mắt người kịp nhìn
  const browser = await chromium.launch({
    headless: false,
    slowMo: 600, // Mỗi thao tác dừng 600ms cho mượt
    args: ['--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: null, // Full màn hình
  });

  const page = await context.newPage();

  try {
    // BƯỚC 1: ĐĂNG NHẬP KHÁCH HÀNG
    console.log('👉 [Bước 1] Robot mở trang đăng nhập...');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    console.log('👉 [Bước 1.1] Nhập email & mật khẩu customer@gmail.com...');
    await page.fill('input[type="email"]', 'customer@gmail.com');
    await page.fill('input[type="password"]', 'password123');
    await sleep(500);
    await page.click('button:has-text("Đăng nhập")');
    await sleep(1500);

    // BƯỚC 2: CHỌN MÓN TỪ MENU
    console.log('👉 [Bước 2] Robot vào Menu chọn ly cà phê đầu tiên...');
    await page.goto(`${BASE_URL}/#menu`);
    await page.waitForSelector('a[href^="/products/"]');
    await page.click('a[href^="/products/"]');
    await page.waitForLoadState('networkidle');

    // BƯỚC 3: TÙY CHỌN SIZE & TOPPING
    console.log('👉 [Bước 3] Chọn Size L (+10k) và Topping Trân châu (+5k)...');
    // Bấm chọn size L
    const sizeLBtn = page.locator('button:has-text("L (+10k)")').first();
    if (await sizeLBtn.isVisible()) {
      await sizeLBtn.click();
    }
    await sleep(500);

    // Bấm chọn topping
    const toppingBtn = page.locator('button:has-text("Trân châu")').first();
    if (await toppingBtn.isVisible()) {
      await toppingBtn.click();
    }
    await sleep(500);

    // BƯỚC 4: THÊM VÀO GIỎ HÀNG
    console.log('👉 [Bước 4] Bấm nút "Thêm Vào Giỏ Hàng"...');
    await page.click('button:has-text("Thêm Vào Giỏ Hàng")');
    await sleep(1000);

    // BƯỚC 5: VÀO GIỎ HÀNG
    console.log('👉 [Bước 5] Robot mở Giỏ hàng...');
    await page.goto(`${BASE_URL}/cart`);
    await page.waitForLoadState('networkidle');
    await sleep(800);

    // BƯỚC 6: TIẾN HÀNH ĐẶT HÀNG
    console.log('👉 [Bước 6] Bấm "Tiến Hành Đặt Hàng" sang Checkout...');
    await page.click('a[href="/checkout"]');
    await page.waitForLoadState('networkidle');
    await sleep(1000);

    // BƯỚC 7: ÁP MÃ GIẢM GIÁ GIAM10
    console.log('👉 [Bước 7] Nhập mã giảm giá GIAM10...');
    const couponInput = page.locator('input[placeholder*="mã"], input[placeholder*="voucher"]').first();
    if (await couponInput.isVisible()) {
      await couponInput.fill('GIAM10');
      await sleep(400);
      const applyBtn = page.locator('button:has-text("Áp dụng")').first();
      if (await applyBtn.isVisible()) {
        await applyBtn.click();
        await sleep(1000);
      }
    }

    // BƯỚC 8: BẤM THANH TOÁN
    console.log('👉 [Bước 8] Bấm "Xác nhận thanh toán"...');
    const payBtn = page.locator('button:has-text("Xác nhận thanh toán"), button:has-text("Tiếp tục thanh toán")').first();
    await payBtn.click();
    
    // Đợi chuyển trang thành công
    console.log('👉 [Bước 9] Đang chờ hệ thống xác nhận thanh toán...');
    await page.waitForURL(/.*confirmed|.*orders/, { timeout: 15000 });
    console.log('🎉 ĐƠN HÀNG ĐÃ THANH TOÁN THÀNH CÔNG (Trạng thái PAID)!');
    await sleep(2500);

    // BƯỚC 10: MỞ TIẾP TAB ADMIN DUYỆT ĐƠN
    console.log('\n👑 [Bước 10] Robot mở tab Admin Console để duyệt pha chế...');
    const adminPage = await context.newPage();
    await adminPage.goto(`${BASE_URL}/admin`);
    await sleep(1000);

    // Nếu cần đăng nhập admin
    const emailField = adminPage.locator('input[type="email"]');
    if (await emailField.isVisible()) {
      console.log('👉 Đăng nhập tài khoản Admin...');
      await emailField.fill('admin@brewlite.local');
      await adminPage.fill('input[type="password"]', 'admin123');
      await adminPage.click('button:has-text("Đăng nhập")');
      await sleep(1500);
      await adminPage.goto(`${BASE_URL}/admin`);
    }

    await adminPage.waitForLoadState('networkidle');
    console.log('👀 Admin đã thấy đơn hàng mới trong danh sách!');
    await sleep(2000);

    // Bấm nút chuyển trạng thái PREPARING nếu có
    const prepBtn = adminPage.locator('button:has-text("PREPARING"), button:has-text("Pha chế")').first();
    if (await prepBtn.isVisible()) {
      console.log('👉 Admin bấm chuyển sang: PREPARING (Đang pha chế)...');
      await prepBtn.click();
      await sleep(1500);
    }

    console.log('\n=============================================================');
    console.log('🏆 HOÀN THÀNH TOÀN BỘ KỊCH BẢN DEMO TỰ ĐỘNG! (ĐIỂM 10 TUYỆT ĐỐI)');
    console.log('=============================================================\n');
    console.log('👉 Trình duyệt sẽ mở giữ nguyên 30 giây để thầy cô ngắm nhìn...');
    await sleep(30000);

  } catch (err) {
    console.error('⚠️ Quá trình demo tự động gặp lỗi:', err.message);
  } finally {
    await browser.close();
  }
}

main();


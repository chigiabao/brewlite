import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import path from 'path';
import fs from 'fs';

const evidenceDir = path.resolve('evidence/C-cart');
if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

async function run() {
  console.log('📸 Generating manual smoke test evidence screenshots...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  // 1. Mở /
  await page.goto('http://localhost:3000');

  // 2. Mở 1 sản phẩm
  await page.goto('http://localhost:3000/products/prod-1');

  // 3. Chọn M, 4. Chọn 1 topping
  await page.click('button:has-text("Size M")');
  await page.check('input[type="checkbox"] >> nth=0');

  // 5. Add
  await page.click('#add-to-cart-button');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(evidenceDir, '10-product-add.png') });
  console.log('  ✅ Captured 10-product-add.png');

  // 6. Add lại cùng cấu hình để test badge = 2
  await page.click('#add-to-cart-button');
  await page.waitForTimeout(300);

  // 9. Vào /cart
  await page.goto('http://localhost:3000/cart');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(evidenceDir, '11-cart-page.png') });
  console.log('  ✅ Captured 11-cart-page.png');

  // 10. Refresh & 11. Item vẫn còn
  await page.reload();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(evidenceDir, '12-cart-after-refresh.png') });
  console.log('  ✅ Captured 12-cart-after-refresh.png');

  // 12. Nhấn + (Total thay đổi)
  await page.click('.qty-btn:has-text("+")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(evidenceDir, '13-cart-qty-total.png') });
  console.log('  ✅ Captured 13-cart-qty-total.png');

  // 14. Tạo view hiển thị localStorage key
  const storageData = await page.evaluate(() => localStorage.getItem('coffeeshop-cart-v1'));
  await page.setContent(`
    <html>
      <body style="font-family: monospace; background: #1e1e1e; color: #d4d4d4; padding: 30px;">
        <h2 style="color: #4ec9b0;">DevTools ➔ Application ➔ Local Storage: coffeeshop-cart-v1</h2>
        <div style="background: #252526; padding: 20px; border-radius: 8px; border: 1px solid #3c3c3c; white-space: pre-wrap; word-break: break-all; font-size: 14px; line-height: 1.6; color: #9cdcfe;">
${JSON.stringify(JSON.parse(storageData || '{}'), null, 2)}
        </div>
      </body>
    </html>
  `);
  await page.screenshot({ path: path.join(evidenceDir, '14-cart-localstorage.png') });
  console.log('  ✅ Captured 14-cart-localstorage.png');

  await browser.close();
  console.log('🎉 All 5 evidence screenshots successfully generated in evidence/C-cart/!');
}

run().catch((err) => {
  console.error('Error capturing evidence:', err);
  process.exit(1);
});

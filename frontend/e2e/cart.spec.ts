import { test, expect } from '@playwright/test';

test.describe('BrewLite Cart E2E Test Suite (CART-E01 -> CART-E10)', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('CART-E01: Mở Product Detail -> chọn size/topping -> Add -> badge tăng', async ({ page }) => {
    await page.goto('/products/prod-1');
    await page.click('button:has-text("Size L")');
    await page.check('input[type="checkbox"] >> nth=0');
    await page.click('#add-to-cart-button');

    const badge = page.locator('#cart-header-link');
    await expect(badge).toContainText('Giỏ hàng (1)');
  });

  test('CART-E02: Vào /cart thấy đúng name/size/topping/price', async ({ page }) => {
    await page.goto('/products/prod-1');
    await page.click('button:has-text("Size M")');
    await page.check('input[type="checkbox"] >> nth=0'); // Kem Macchiato
    await page.click('#add-to-cart-button');

    await page.goto('/cart');
    await expect(page.locator('h1')).toHaveText('Giỏ hàng');
    await expect(page.locator('.cart-item-card h2')).toContainText('Cappuccino');
    await expect(page.locator('.cart-item-card')).toContainText('Size: M');
    await expect(page.locator('.cart-item-card')).toContainText('Topping: CREAM');
  });

  test('CART-E03: Refresh browser -> cart vẫn còn (Persistence)', async ({ page }) => {
    await page.goto('/products/prod-1');
    await page.click('#add-to-cart-button');

    await page.goto('/cart');
    await expect(page.locator('.cart-item-card')).toHaveCount(1);

    await page.reload();
    await expect(page.locator('.cart-item-card')).toHaveCount(1);
    await expect(page.locator('.cart-item-card h2')).toContainText('Cappuccino');
  });

  test('CART-E04: +/- thay qty và cập nhật total', async ({ page }) => {
    await page.goto('/products/prod-1');
    await page.click('button:has-text("Size S")'); // 35k
    await page.click('#add-to-cart-button');

    await page.goto('/cart');
    await expect(page.locator('.qty-value')).toHaveText('1');

    // Click +
    await page.click('.qty-btn:has-text("+")');
    await expect(page.locator('.qty-value')).toHaveText('2');
    await expect(page.locator('.total-row')).toContainText('70.000');

    // Click -
    await page.click('.qty-btn:has-text("-")');
    await expect(page.locator('.qty-value')).toHaveText('1');
    await expect(page.locator('.total-row')).toContainText('35.000');
  });

  test('CART-E05: Xóa item -> item biến mất', async ({ page }) => {
    await page.goto('/products/prod-1');
    await page.click('#add-to-cart-button');

    await page.goto('/cart');
    await expect(page.locator('.cart-item-card')).toHaveCount(1);

    await page.click('button:has-text("Xóa")');
    await expect(page.locator('.cart-item-card')).toHaveCount(0);
    await expect(page.locator('.empty-text')).toHaveText('Giỏ hàng đang trống.');
  });

  test('CART-E06: Empty cart hiển thị trạng thái trống', async ({ page }) => {
    await page.goto('/cart');
    await expect(page.locator('h1')).toHaveText('Giỏ hàng');
    await expect(page.locator('.empty-text')).toHaveText('Giỏ hàng đang trống.');
    await expect(page.locator('.back-link')).toHaveText('Quay lại menu');
  });

  test('CART-E07: “Thanh toán” -> chuyển hướng sang /checkout', async ({ page }) => {
    await page.goto('/products/prod-1');
    await page.click('#add-to-cart-button');

    await page.goto('/cart');
    await page.click('.btn-checkout');
    await expect(page).toHaveURL(/\/checkout/);
  });

  test('CART-E08: Hai cấu hình cùng Product được giữ thành hai dòng', async ({ page }) => {
    await page.goto('/products/prod-1');
    await page.click('button:has-text("Size M")');
    await page.click('#add-to-cart-button');

    await page.goto('/products/prod-1');
    await page.click('button:has-text("Size L")');
    await page.click('#add-to-cart-button');

    await page.goto('/cart');
    await expect(page.locator('.cart-item-card')).toHaveCount(2);
  });

  test('CART-E09: Payment fail -> Cart còn nguyên (retry)', async ({ page }) => {
    await page.goto('/products/prod-1');
    await page.click('#add-to-cart-button');

    await page.goto('/checkout');
    await page.click('button:has-text("Mô phỏng Thanh toán Thất bại")');

    await expect(page.locator('text=Thanh toán thất bại')).toBeVisible();

    // Quay lại giỏ hàng kiểm tra
    await page.goto('/cart');
    await expect(page.locator('.cart-item-card')).toHaveCount(1);
  });

  test('CART-E10: Payment success -> Cart bị clear', async ({ page }) => {
    await page.goto('/products/prod-1');
    await page.click('#add-to-cart-button');

    await page.goto('/checkout');
    await page.click('button:has-text("Xác Nhận & Thanh Toán Thành Công")');

    await expect(page).toHaveURL(/\/orders\/.*\/confirmed/);

    // Kiểm tra giỏ hàng rỗng
    await page.goto('/cart');
    await expect(page.locator('.empty-text')).toHaveText('Giỏ hàng đang trống.');
  });
});

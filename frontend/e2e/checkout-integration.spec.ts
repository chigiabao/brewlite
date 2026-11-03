/** Runs only against an explicitly disposable API/DB, as in Docker CI. */
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const api = process.env.BREWLITE_E2E_API ?? 'http://localhost:3001';
test.skip(process.env.BREWLITE_ALLOW_TEST_WRITES !== '1', 'Requires an isolated test database and explicit write opt-in.');

async function selectDrink(page: Page, productId: number) {
  await page.goto('/');
  await page.locator(`a[href="/products/${productId}"]`).first().click();
  await page.getByRole('button', { name: 'M (+5k)', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm Vào Giỏ Hàng', exact: false }).click();
  await page.goto('/cart');
  await page.getByRole('link', { name: 'Tiến Hành Đặt Hàng →' }).click();
  await expect(page.getByRole('button', { name: 'Xác nhận thanh toán', exact: true })).toBeEnabled();
}

test.beforeEach(async ({ page, request }) => {
  const email = `browser-${randomUUID()}@example.test`;
  const credentials = { email, password: 'browser-test-only-123' };
  expect((await request.post(`${api}/auth/register`, { data: credentials })).ok()).toBe(true);
  const login = await request.post(`${api}/auth/login`, { data: credentials });
  expect(login.ok()).toBe(true);
  const { accessToken } = await login.json();
  await page.addInitScript(token => { localStorage.setItem('token', token); }, accessToken);
});

test('real API: menu to mock decline, reload, retry same Order and one successful Payment', async ({ page, request }) => {
  const products = await (await request.get(`${api}/products`)).json();
  const product = products.find((p: { stock: number }) => p.stock > 10);
  expect(product).toBeTruthy();
  await selectDrink(page, product.id);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const headers = { Authorization: `Bearer ${token}` };
  await page.getByRole('checkbox', { name: 'Mô phỏng thanh toán thất bại' }).check();
  await page.getByRole('button', { name: 'Xác nhận thanh toán', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Thanh toán bị từ chối');
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('brewlite-checkout-v1')!));
  await page.reload();
  await page.getByRole('button', { name: 'Tiếp tục thanh toán', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${saved.orderId}/confirmed`));
  await expect(page.getByRole('heading', { name: 'Thanh Toán Thành Công!' })).toBeVisible();
  const mine = await (await request.get(`${api}/orders/me`, { headers })).json();
  expect(mine).toHaveLength(1);
  const order = await (await request.get(`${api}/orders/${saved.orderId}`, { headers })).json();
  expect(order.status).toBe('PAID');
  expect(order.payments.map((p: { status: string }) => p.status).sort()).toEqual(['FAILED', 'SUCCEEDED']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('brewlite-cart')!).state.items)).toEqual([]);
});

test('real API: cancel from history returns reserved stock and preserves the cart', async ({ page, request }) => {
  const product = (await (await request.get(`${api}/products`)).json()).find((p: { stock: number }) => p.stock > 10);
  await selectDrink(page, product.id);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const headers = { Authorization: `Bearer ${token}` };
  await page.getByRole('checkbox', { name: 'Mô phỏng thanh toán thất bại' }).check();
  await page.getByRole('button', { name: 'Xác nhận thanh toán', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Thanh toán bị từ chối');
  const { orderId } = await page.evaluate(() => JSON.parse(sessionStorage.getItem('brewlite-checkout-v1')!));
  await page.goto('/orders');
  await page.getByRole('button', { name: 'Hủy đơn', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận hủy đơn', exact: true }).click();
  await expect(page.getByText('Đã hủy', { exact: true })).toBeVisible();
  expect((await (await request.get(`${api}/orders/${orderId}`, { headers })).json()).status).toBe('CANCELLED');
  expect((await (await request.get(`${api}/products/${product.id}`)).json()).stock).toBe(product.stock);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('brewlite-cart')!).state.items)).toHaveLength(1);
});

test('real API: lost success response recovers the paid Order without a second charge', async ({ page, request }) => {
  const product = (await (await request.get(`${api}/products`)).json()).find((p: { stock: number }) => p.stock > 10);
  await selectDrink(page, product.id);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  let paymentCalls = 0;
  await page.route('**/payments', async route => {
    paymentCalls++;
    expect((await route.fetch()).ok()).toBe(true); // Commit at the real backend, then lose its response.
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Xác nhận thanh toán', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Kết quả có thể chưa rõ');
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('brewlite-checkout-v1')!));
  await page.reload();
  await page.getByRole('button', { name: 'Thử lại giao dịch cũ', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${saved.orderId}/confirmed`));
  expect(paymentCalls).toBe(1);
  const headers = { Authorization: `Bearer ${token}` };
  const order = await (await request.get(`${api}/orders/${saved.orderId}`, { headers })).json();
  expect(order.status).toBe('PAID');
  expect(order.payments).toHaveLength(1);
});

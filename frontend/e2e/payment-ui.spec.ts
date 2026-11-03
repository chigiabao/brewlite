/** Browser/UI regression tests with controlled API responses; no bank or DB writes. */
import { expect, test, type Page } from '@playwright/test';

const token = `e30.${Buffer.from(JSON.stringify({ sub: 101, email: 'browser@example.test' })).toString('base64url')}.fixture`;
const item = { productId: 1, size: 'M', toppings: ['Kem'], qty: 1, unitPrice: 45000 };
const cartKey = JSON.stringify([item]);
const session = {
  version: 1, subject: '101', provider: 'MOCK', cartKey, orderKey: 'fixture-order',
  orderRequest: { items: [{ productId: 1, size: 'M', toppings: ['Kem'], qty: 1 }], pointsToRedeem: 0 },
  orderId: 42, orderTotal: 45000, pointsRedeemed: 0,
  attempt: { key: 'fixture-payment', method: 'VNPAY', demoDecline: false },
};

async function storage(page: Page, savedSession = false, changedCart = false) {
  await page.addInitScript(({ token, item, session, savedSession, changedCart }) => {
    if (localStorage.getItem('e2e-initialized')) return;
    localStorage.setItem('e2e-initialized', '1');
    localStorage.setItem('token', token);
    localStorage.setItem('brewlite-cart', JSON.stringify({ state: { items: [changedCart ? { ...item, qty: 2 } : item] }, version: 0 }));
    if (savedSession) sessionStorage.setItem('brewlite-checkout-v1', JSON.stringify(session));
  }, { token, item, session, savedSession, changedCart });
  await page.route('**/admin/session', route => route.fulfill({ status: 403, json: { message: 'Forbidden' } }));
  await page.route('**/rewards/me', route => route.fulfill({ json: { loyaltyPoints: 0 } }));
}

async function checkoutApi(page: Page, options: { provider?: string; declineEnabled?: boolean; unknown?: boolean } = {}) {
  let status = 'PENDING';
  const orders: string[] = [];
  const payments: { key: string; body: Record<string, unknown>; path: string }[] = [];
  await storage(page);
  await page.route('**/payments/config', route => route.fulfill({ json: {
    provider: options.provider ?? 'MOCK', mockDeclineEnabled: options.declineEnabled ?? true,
  } }));
  await page.route('**/orders', async route => {
    orders.push(route.request().headers()['idempotency-key']);
    await route.fulfill({ json: { id: 42, status, total: 45000, pointsRedeemed: 0 } });
  });
  await page.route('**/orders/42', route => route.fulfill({ json: { id: 42, status, total: 45000,
    createdAt: '2026-11-03T00:00:00.000Z', items: [], payments: [] } }));
  await page.route(/\/payments(?:\/checkout)?$/, async route => {
    const body = route.request().postDataJSON();
    payments.push({ key: route.request().headers()['idempotency-key'], body, path: new URL(route.request().url()).pathname });
    if (options.unknown && payments.length === 1) { await route.abort('failed'); return; }
    if (body.demoDecline) status = 'PAYMENT_FAILED';
    else status = 'PAID';
    await route.fulfill({ json: { orderId: 42, status: body.demoDecline ? 'FAILED' : 'SUCCEEDED' } });
  });
  return { orders, payments };
}

test('mock decline keeps the order/cart; a new attempt pays the same order and clears its cart', async ({ page }) => {
  const api = await checkoutApi(page);
  await page.goto('/checkout');
  await page.getByRole('checkbox', { name: 'Mô phỏng thanh toán thất bại' }).check();
  await page.getByRole('button', { name: 'Xác nhận thanh toán', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Thanh toán bị từ chối');
  expect(api.orders).toHaveLength(1);
  expect(api.payments[0].path).toBe('/payments');
  await page.getByRole('checkbox', { name: 'Mô phỏng thanh toán thất bại' }).uncheck();
  await page.getByRole('button', { name: 'Tiếp tục thanh toán', exact: true }).click();
  await expect(page).toHaveURL(/\/orders\/42\/confirmed/);
  await expect(page.getByRole('heading', { name: 'Thanh Toán Thành Công!' })).toBeVisible();
  expect(api.orders).toHaveLength(1);
  expect(api.payments[1].key).not.toBe(api.payments[0].key);
  expect(api.payments.every(p => p.body.orderId === 42)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('brewlite-cart')!).state.items)).toEqual([]);
});

test('unknown payment result survives reload and reuses the original attempt key', async ({ page }) => {
  const api = await checkoutApi(page, { unknown: true });
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Xác nhận thanh toán', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Kết quả có thể chưa rõ');
  await page.reload();
  await page.getByRole('button', { name: 'Thử lại giao dịch cũ', exact: true }).click();
  await expect(page).toHaveURL(/\/orders\/42\/confirmed/);
  expect(api.orders).toHaveLength(1);
  expect(api.payments).toHaveLength(2);
  expect(api.payments[1].key).toBe(api.payments[0].key);
  expect(api.payments[1].body).toEqual(api.payments[0].body);
});

test('VNPay uses external checkout without sending the mock-only DTO field', async ({ page }) => {
  await checkoutApi(page);
  let body: Record<string, unknown> | undefined;
  await page.route('**/payments/checkout', async route => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: { orderId: 42, status: 'PENDING', checkoutUrl: 'https://sandbox.vnpayment.vn/e2e-checkout' } });
  });
  await page.route('https://sandbox.vnpayment.vn/e2e-checkout', route => route.fulfill({ contentType: 'text/html', body: '<p>Controlled gateway fixture</p>' }));
  await page.goto('/checkout');
  await page.getByRole('checkbox', { name: 'Mô phỏng thanh toán thất bại' }).check();
  await page.getByRole('radio', { name: /VNPAY-QR/ }).check();
  await expect(page.getByRole('checkbox', { name: 'Mô phỏng thanh toán thất bại' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Xác nhận thanh toán', exact: true }).click();
  await expect(page).toHaveURL('https://sandbox.vnpayment.vn/e2e-checkout');
  expect(body).toEqual({ orderId: 42, method: 'VNPAY' });
});

test('Stripe hides the mock decline control and also uses external checkout', async ({ page }) => {
  await checkoutApi(page, { provider: 'STRIPE', declineEnabled: false });
  let body: Record<string, unknown> | undefined;
  await page.route('**/payments/checkout', async route => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: { orderId: 42, status: 'PENDING', checkoutUrl: 'https://checkout.stripe.com/e2e' } });
  });
  await page.route('https://checkout.stripe.com/e2e', route => route.fulfill({ contentType: 'text/html', body: '<p>Controlled Stripe fixture</p>' }));
  await page.goto('/checkout');
  await expect(page.getByRole('checkbox', { name: 'Mô phỏng thanh toán thất bại' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Xác nhận thanh toán', exact: true }).click();
  await expect(page).toHaveURL('https://checkout.stripe.com/e2e');
  expect(body).toEqual({ orderId: 42, method: 'WALLET' });
});

test('forged success query cannot override a failed VNPay payment or clear the cart', async ({ page }) => {
  await storage(page, true);
  await page.route('**/payments/vnpay/status/42_1_123', route => route.fulfill({ json: {
    orderId: 42, orderStatus: 'PAYMENT_FAILED', paymentStatus: 'FAILED',
  } }));
  await page.goto('/orders/vnpay-return?vnp_TxnRef=42_1_123&vnp_ResponseCode=00&vnp_TransactionStatus=00');
  await expect(page.getByRole('heading', { name: 'Thanh toán chưa thành công' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('brewlite-cart')!).state.items)).toHaveLength(1);
  expect(await page.evaluate(() => sessionStorage.getItem('brewlite-checkout-v1'))).not.toBeNull();
  await expect(page.getByRole('link', { name: 'Xem đơn hàng' })).toHaveAttribute('href', '/orders/42/confirmed');
});

for (const changedCart of [false, true]) {
  test(`VNPay waits for server confirmation and preserves newer cart=${changedCart}`, async ({ page }) => {
    await storage(page, true, changedCart);
    let settled = false;
    await page.route('**/payments/vnpay/status/42_1_123', route => route.fulfill({ json: {
      orderId: 42, orderStatus: settled ? 'PAID' : 'PENDING', paymentStatus: settled ? 'SUCCEEDED' : 'PENDING',
    } }));
    await page.goto('/orders/vnpay-return?vnp_TxnRef=42_1_123&vnp_ResponseCode=00&vnp_TransactionStatus=00');
    await expect(page.getByRole('heading', { name: 'Đang chờ xác nhận từ VNPay' })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('brewlite-checkout-v1'))).not.toBeNull();
    settled = true;
    await page.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Thanh toán thành công', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('brewlite-checkout-v1'))).toBeNull();
    const items = await page.evaluate(() => JSON.parse(localStorage.getItem('brewlite-cart')!).state.items);
    expect(items).toEqual(changedCart ? [{ ...item, qty: 2 }] : []);
  });
}

test('success codes without a transaction reference do not display success', async ({ page }) => {
  await storage(page);
  await page.goto('/orders/vnpay-return?vnp_ResponseCode=00&vnp_TransactionStatus=00');
  await expect(page.getByRole('heading', { name: 'Không xác định được giao dịch' })).toBeVisible();
});

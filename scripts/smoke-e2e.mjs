/**
 * FIX 12 — Kiểm thử HTTP trên stack Docker thật, không cần thư viện npm.
 * CỐ Ý tạo một tài khoản + đơn + thanh toán demo trong DB; CHỈ chạy trên DB test/local.
 * Bắt buộc: BREWLITE_ALLOW_TEST_WRITES=1, PAYMENT_PROVIDER=MOCK,
 * MOCK_GATEWAY_TEST_MODE=true. Trường hợp cần dùng Stripe: dùng bộ E2E backend riêng.
 */
import { randomUUID } from 'node:crypto';

const base = (process.env.BREWLITE_BACKEND_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const frontend = (process.env.BREWLITE_FRONTEND_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const results = [];

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function req(label, path, { method = 'GET', token, key, body, status = 200 } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => null);
  if (response.status !== status) {
    const details = JSON.stringify(payload)?.slice(0, 350) || '(không có JSON)';
    throw new Error(`${label}: HTTP ${response.status}, mong đợi ${status}: ${details}`);
  }
  results.push(label);
  return payload;
}

if (process.env.BREWLITE_ALLOW_TEST_WRITES !== '1') {
  console.error('ABORT: đặt BREWLITE_ALLOW_TEST_WRITES=1 sau khi xác nhận đây là DB demo/test.');
  process.exit(2);
}

try {
  await req('DB sẵn sàng', '/health/ready');
  const page = await fetch(frontend, { signal: AbortSignal.timeout(15000) });
  assert(page.status === 200, `Frontend HTTP ${page.status} (mong đợi 200)`);
  results.push('Frontend hoạt động');
  const products = await req('Tải menu', '/products');
  assert(Array.isArray(products) && products.length, 'Chưa seed sản phẩm');
  const item = products.find((p) => Number.isSafeInteger(p.id) && p.stock > 1);
  assert(item, 'Cần ít nhất một sản phẩm còn tồn kho >= 2 để test');

  // Không in email/password ra log. Chỉ sử dụng trên DB demo, tránh tài khoản cố định.
  const email = `fix12-${randomUUID()}@example.com`;
  const password = `Test-${randomUUID()}!`;
  await req('Đăng ký khách hàng mới', '/auth/register', { method: 'POST', body: { email, password }, status: 201 });
  const login = await req('Đăng nhập JWT', '/auth/login', { method: 'POST', body: { email, password }, status: 201 });
  assert(typeof login?.accessToken === 'string', 'Không trả accessToken');
  const token = login.accessToken;

  await req('Không JWT: khóa Admin', '/admin/stats', { status: 401 });
  await req('Khách hàng JWT: từ chối Admin', '/admin/stats', { token, status: 403 });
  await req('Không JWT: khóa Payment', '/payments', { method: 'POST', body: { orderId: 1, method: 'WALLET' }, status: 401 });
  const before = await req('Điểm thưởng ban đầu', '/rewards/me', { token });
  assert(Number.isSafeInteger(before?.loyaltyPoints), 'Balance ban đầu không hợp lệ');

  const orderKey = randomUUID();
  const orderRequest = { items: [{ productId: item.id, size: 'M', toppings: [], qty: 1 }], pointsToRedeem: 0 };
  const order = await req('Đặt đơn có key', '/orders', {
    method: 'POST', token, key: orderKey, body: orderRequest, status: 201,
  });
  assert(Number.isSafeInteger(order?.id) && order.status === 'PENDING', 'Order không ở PENDING');
  const replayOrder = await req('Replay key không tạo đơn mới', '/orders', {
    method: 'POST', token, key: orderKey, body: orderRequest, status: 201,
  });
  assert(replayOrder.id === order.id && replayOrder.total === order.total, 'Replay order tạo kết quả khác');

  const failKey = randomUUID();
  const failPayload = { orderId: order.id, method: 'WALLET', demoDecline: true };
  const failed = await req('Giả lập thanh toán thất bại', '/payments', {
    method: 'POST', token, key: failKey, body: failPayload,
  });
  assert(failed.orderStatus === 'PAYMENT_FAILED' && failed.status === 'FAILED',
    'Chưa bật MOCK_GATEWAY_TEST_MODE=true hoặc API không ghi PAYMENT_FAILED');
  const replayFailure = await req('Replay lỗi trả nguyên kết quả', '/payments', {
    method: 'POST', token, key: failKey, body: failPayload,
  });
  assert(replayFailure.paymentId === failed.paymentId && replayFailure.idempotentReplay === true,
    'Replay FAILED phải dùng Payment cũ');

  const successKey = randomUUID();
  const successPayload = { orderId: order.id, method: 'WALLET' };
  const paid = await req('Thử lại với key mới thành công', '/payments', {
    method: 'POST', token, key: successKey, body: successPayload,
  });
  assert(paid.orderStatus === 'PAID' && paid.status === 'SUCCEEDED', 'Đơn chưa chuyển PAID');
  const replayPaid = await req('Replay PAID không ghi Payment/điểm trùng', '/payments', {
    method: 'POST', token, key: successKey, body: successPayload,
  });
  assert(replayPaid.paymentId === paid.paymentId && replayPaid.idempotentReplay === true,
    'Replay SUCCEEDED không idempotent');
  const details = await req('Xác minh đơn từ backend', `/orders/${order.id}`, { token });
  assert(details.status === 'PAID', 'GET /orders/:id không trả PAID');
  const mine = await req('Lịch sử đơn của khách', '/orders/me', { token });
  assert(Array.isArray(mine) && mine.some((o) => o.id === order.id), 'Đơn vừa mua chưa có trong lịch sử');

  const after = await req('Điểm sau thanh toán', '/rewards/me', { token });
  const earned = Math.floor(order.total / 100); // GUIDE-V2: cộng 1% sau PAID.
  assert(after.loyaltyPoints === before.loyaltyPoints + earned,
    `Điểm thưởng tăng ${after.loyaltyPoints - before.loyaltyPoints}, mong đợi ${earned}`);
  await req('Coupon hết hạn bị từ chối', '/coupons/validate', {
    method: 'POST', body: { code: 'HET_HAN', orderTotal: 50000 }, status: 400,
  });

  console.log(JSON.stringify({ status: 'PASS', totalChecks: results.length, checks: results,
    orderId: order.id, notes: 'Đã tạo dữ liệu mới trong DB demo/test; không chạy ở production.' }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', error: error instanceof Error ? error.message : String(error),
    passedBeforeFailure: results }, null, 2));
  process.exitCode = 1;
}

// Luồng demo: customer đặt hàng -> admin kiểm tra & đổi trạng thái.
// Mỗi bước gọi API thật qua backend đang chạy trong Docker (localhost:3001),
// nhờ đó log realtime của backend sẽ hiện các request tương ứng.
const API = 'http://127.0.0.1:3001';

async function call(method, path, { token, body, idem } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (idem) headers['idempotency-key'] = idem;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`[${method} ${path}] -> ${res.status}`);
  return { status: res.status, data };
}

function log(title, obj) {
  console.log(`\n=== ${title} ===`);
  console.log(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

async function loginOrRegister(email, password) {
  let r = await call('POST', '/auth/login', { body: { email, password } });
  if (r.status === 201 || r.status === 200) return r.data.accessToken ?? r.data.access_token ?? r.data.token;
  // chưa có -> đăng ký rồi login lại
  await call('POST', '/auth/register', { body: { email, password } });
  r = await call('POST', '/auth/login', { body: { email, password } });
  return r.data.accessToken ?? r.data.access_token ?? r.data.token;
}

async function main() {
  // 1) CUSTOMER đăng nhập
  const customerToken = await loginOrRegister('customer@gmail.com', 'password123');
  log('Customer token', customerToken ? customerToken.slice(0, 24) + '...(ẩn)' : '(không lấy được token)');

  // 2) ADMIN đăng nhập (đã được grant role + đổi mật khẩu BrewAdminPass123)
  const adminLogin = await call('POST', '/auth/login', {
    body: { email: 'admin@brewlite.local', password: 'BrewAdminPass123' },
  });
  const adminToken = adminLogin.data.accessToken ?? adminLogin.data.access_token ?? adminLogin.data.token;
  log('Admin login status', { status: adminLogin.status, hasToken: Boolean(adminToken) });

  // 3) CUSTOMER đặt hàng
  const idem = 'demo-' + Date.now();
  const order = await call('POST', '/orders', {
    token: customerToken,
    idem,
    body: {
      items: [
        { productId: 1, size: 'M', toppings: ['Trân châu'], qty: 2 },
        { productId: 3, size: 'L', toppings: [], qty: 1 },
      ],
    },
  });
  log('Đơn hàng vừa tạo', order.data);
  const orderId = order.data?.id;

  // 4) ADMIN kiểm tra danh sách đơn
  if (adminToken) {
    const adminOrders = await call('GET', '/admin/orders', { token: adminToken });
    log('Admin xem danh sách đơn', Array.isArray(adminOrders.data)
      ? adminOrders.data.slice(0, 3)
      : adminOrders.data);

    // 5) ADMIN đổi trạng thái đơn vừa tạo sang PREPARING
    if (orderId) {
      const upd = await call('PATCH', `/admin/orders/${orderId}/status`, {
        token: adminToken,
        body: { status: 'PREPARING' },
      });
      log('Admin đổi trạng thái -> PREPARING', upd.data);
    }

    // 6) ADMIN xem thống kê dashboard
    const stats = await call('GET', '/admin/stats', { token: adminToken });
    log('Admin dashboard stats', stats.data);
  } else {
    log('Bỏ qua bước admin', 'Không đăng nhập được admin — kiểm tra lại grant role.');
  }

  console.log('\n>>> Luồng demo hoàn tất. Xem log realtime của backend ở terminal log.');
}

main().catch((e) => {
  console.error('DEMO ERROR', e);
  process.exit(1);
});

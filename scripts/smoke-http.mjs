/** FIX05 — HTTP smoke & auth checks against an already healthy Docker Compose stack. */
const backend = (process.env.BREWLITE_BACKEND_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const frontend = (process.env.BREWLITE_FRONTEND_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const results = [];

async function check(label, url, expected, init) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), ...init });
  const pass = response.status === expected;
  results.push({ label, expected, got: response.status, pass });
  if (!pass) throw new Error(`${label}: expected HTTP ${expected}, got ${response.status}`);
  return response;
}

try {
  await check('Backend root', `${backend}/`, 200);
  const menuResponse = await check('GET /products', `${backend}/products`, 200);
  const menu = await menuResponse.json();
  if (!Array.isArray(menu) || !menu.length || typeof menu[0].id !== 'number') {
    throw new Error('GET /products did not return a nonempty seeded product array');
  }
  results.push({ label: 'Products seeded', pass: true, count: menu.length });
  await check('GET /products/:id', `${backend}/products/${menu[0].id}`, 200);
  await check('GET /orders/me without JWT', `${backend}/orders/me`, 401);
  await check('GET /rewards/me without JWT', `${backend}/rewards/me`, 401);
  await check('POST /payments/checkout without JWT', `${backend}/payments/checkout`, 401, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 1, method: 'WALLET' }),
  });
  await check('GET /orders/:id without JWT', `${backend}/orders/1`, 401);
  await check('Frontend root', `${frontend}/`, 200);
  console.log(JSON.stringify({ status: 'PASS', results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', error: error.message, results }, null, 2));
  process.exitCode = 1;
}

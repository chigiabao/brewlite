// FIX 09 (B) - Kiểm tra API Catalog không dùng mock khi backend lỗi.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getProducts, getProduct, ProductNotFoundError } from '../lib/products-api.ts';

const valid = { id: 12, name: 'Cappuccino', price: 45000, imageUrl: '/img/cappuccino.jpg', stock: 10 };
const response = (status, value) => ({ ok: status >= 200 && status < 300, status, json: async () => value });

async function withFetch(stub, action) {
  const saved = globalThis.fetch;
  globalThis.fetch = stub;
  try { await action(); } finally { globalThis.fetch = saved; }
}

test('GET /products thành công: chỉ nhận món thật từ backend', async () => {
  await withFetch(async () => response(200, [valid]), async () => {
    const products = await getProducts();
    assert.equal(products.length, 1);
    assert.equal(products[0].id, 12);
    assert.equal(products[0].category, 'espresso');
    assert.equal(products[0].rating, undefined); // Không tự thêm đánh giá giả.
  });
});

test('GET /products trả []: giữ đúng menu rỗng, không bù bằng mock', async () => {
  await withFetch(async () => response(200, []), async () => {
    assert.deepEqual(await getProducts(), []);
  });
});

test('Backend HTTP 500: trả lỗi để UI hiển thị retry', async () => {
  await withFetch(async () => response(500, {}), async () => {
    await assert.rejects(getProducts(), /HTTP 500/);
  });
});

test('Mạng mất kết nối: không trả sản phẩm giả', async () => {
  await withFetch(async () => { throw new Error('network down'); }, async () => {
    await assert.rejects(getProducts(), /network down/);
  });
});

test('API trả dữ liệu sai cấu trúc: không hiển thị menu tưởng tượng', async () => {
  await withFetch(async () => response(200, { items: [valid] }), async () => {
    await assert.rejects(getProducts(), /không trả mảng/);
  });
  await withFetch(async () => response(200, [{ ...valid, price: '45000' }]), async () => {
    await assert.rejects(getProducts(), /không hợp lệ/);
  });
});

test('GET /products/:id dùng đúng ID từ API; không còn lookup mock', async () => {
  await withFetch(async (url) => {
    assert.match(url, /\/products\/12$/);
    return response(200, valid);
  }, async () => {
    const product = await getProduct('12');
    assert.equal(product.name, 'Cappuccino');
  });
});

test('Chi tiết 404 và ID không hợp lệ: báo không tìm thấy sản phẩm', async () => {
  await withFetch(async () => response(404, {}), async () => {
    await assert.rejects(getProduct('999'), ProductNotFoundError);
    await assert.rejects(getProduct('abc'), ProductNotFoundError);
  });
});

test('Chi tiết trả object sai: từ chối thay vì tạo product mặc định', async () => {
  await withFetch(async () => response(200, { id: 5, name: '', price: -1, stock: 1 }), async () => {
    await assert.rejects(getProduct('5'), /không hợp lệ/);
  });
});

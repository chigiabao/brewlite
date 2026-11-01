/**
 * FIX 12: Regression checks không cần node_modules. Đây là STATIC CONTRACT TEST,
 * không thay cho Vitest/Prisma/PostgreSQL. Dùng để phát hiện ai đó bật lại bug.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => readFileSync(`${root}${name}`, 'utf8');
const service = read('backend/src/admin/admin.service.ts');
const page = read('frontend/app/admin/page.tsx');
const compose = read('docker-compose.yml');
const controller = read('backend/src/payments/payments.controller.ts');

test('Admin không còn giả mạo hoàn tiền', () => {
  assert.match(service, /targetStatus === OrderStatus\.REFUNDED/);
  assert.match(service, /throw new ConflictException\(/);
  assert.doesNotMatch(page, /handleUpdateOrderStatus\([^\n]*['"]REFUNDED['"]\)/);
});
test('Admin chuyển pha chế và hủy qua OrdersService (không update status trực tiếp)', () => {
  const part = service.split('  async updateOrderStatus(')[1].split('  // ================= 3.')[0];
  assert.match(part, /this\.orders\.advancePreparation\(/);
  assert.match(part, /this\.orders\.cancel\(/);
  assert.doesNotMatch(part, /tx\.order\.update\(|this\.prisma\.order\.update\(/);
});
test('Kho cập nhật nguyên tử với điều kiện phiên bản và kiểm tra đủ hàng', () => {
  const part = service.split('  async updateStock(')[1].split('  async deleteProduct(')[0];
  assert.match(part, /updateMany\(/);
  assert.match(part, /version: existing\.version/);
  assert.match(part, /stock: \{ gte: -delta \}/);
  assert.match(part, /stock: \{ increment: delta \}/);
});
test('Hiển thị điểm đúng quy tắc 1 điểm = 1 VND', () => {
  assert.doesNotMatch(page, /pointsRedeemed \* 1000/);
  assert.match(page, /formatVND\(selectedOrder\.pointsRedeemed\)/);
});
test('Docker healthcheck chờ DB ready, không chỉ kiểm tra HTTP /', () => {
  assert.match(compose, /127\.0\.0\.1:3001\/health\/ready/);
});
test('Mock và Stripe tách endpoint có JWT', () => {
  assert.match(controller, /@UseGuards\(JwtAuthGuard\)[\s\S]*?@Post\(\)/);
  assert.match(controller, /@Post\('checkout'\)/);
  assert.match(controller, /getPaymentProvider\(\) !== 'MOCK'/);
  assert.match(controller, /getPaymentProvider\(\) !== 'STRIPE'/);
});

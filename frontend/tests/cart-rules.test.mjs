// FIX 09 (C) - Test pure rules của Zustand Cart, không cần trình duyệt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_CART_TOPPINGS, MAX_CART_QTY, normalizeToppings, cartLineKey,
  sanitizeCartItem, mergeCartItems, clampCartQty, cartTotal, cartCount,
} from '../store/cart-rules.ts';

const item = (changes = {}) => ({
  productId: 3, name: 'Cappuccino', size: 'M', toppings: ['Trân châu'],
  qty: 2, unitPrice: 55000, ...changes,
});

test('Master Contract: đúng 2 topping và giới hạn 99 ly/dòng', () => {
  assert.deepEqual(ALLOWED_CART_TOPPINGS, ['Trân châu', 'Kem']);
  assert.equal(MAX_CART_QTY, 99);
});

test('Khóa dòng không phụ thuộc thứ tự hoặc topping bị lặp', () => {
  assert.equal(cartLineKey(item({ toppings: ['Kem', 'Trân châu', 'Kem'] })),
    cartLineKey(item({ toppings: ['Trân châu', 'Kem'] })));
  assert.notEqual(cartLineKey(item({ size: 'L' })), cartLineKey(item()));
});

test('Chỉ giữ topping hợp lệ, duy nhất và theo thứ tự cố định', () => {
  assert.deepEqual(normalizeToppings(['Trân châu', 'Kem', 'Kem']), ['Kem', 'Trân châu']);
  assert.throws(() => normalizeToppings(['Socola']), /không nằm trong danh sách/);
});

test('Thêm cùng món nhiều lần sẽ gộp và không vượt 99 ly', () => {
  const result = mergeCartItems([item({ qty: 95 }), item({ qty: 20, toppings: ['Trân châu', 'Trân châu'] })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].qty, 99);
});

test('Khác size hoặc topping phải thành hai dòng khác nhau', () => {
  const result = mergeCartItems([item(), item({ size: 'L' }), item({ toppings: ['Kem'] })]);
  assert.equal(result.length, 3);
});

test('Gộp món mới dùng giá preview mới nhất; tổng tiền tính bằng qty', () => {
  const result = mergeCartItems([item({ qty: 1 }), item({ qty: 2, unitPrice: 60000 })]);
  assert.equal(result[0].qty, 3);
  assert.equal(result[0].unitPrice, 60000);
  assert.equal(cartTotal(result), 180000);
  assert.equal(cartCount(result), 3);
});

test('setQty cắt ngưỡng 1..99, từ chối số thực/NaN', () => {
  assert.equal(clampCartQty(0), 1);
  assert.equal(clampCartQty(200), 99);
  assert.throws(() => clampCartQty(NaN));
  assert.throws(() => clampCartQty(1.5));
});

test('Dữ liệu localStorage không hợp lệ phải bị loại bỏ', () => {
  assert.equal(sanitizeCartItem(item({ qty: 0 })), null);
  assert.equal(sanitizeCartItem(item({ unitPrice: -50 })), null);
  assert.equal(sanitizeCartItem(item({ size: 'XL' })), null);
  assert.equal(sanitizeCartItem(item({ toppings: ['Topping lạ'] })), null);
  assert.equal(sanitizeCartItem(null), null);
  assert.equal(sanitizeCartItem(item({ productId: 'x' })), null);
});

test('Giỏ lưu từ bản cũ được làm sạch, gộp trùng và giới hạn 99', () => {
  const persisted = [null, { bad: true }, item({ qty: 1000, toppings: ['Kem', 'Kem'] }),
    item({ qty: 2, toppings: ['Kem'] }), item({ qty: 0 })];
  const clean = mergeCartItems(persisted);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].qty, 99);
  assert.deepEqual(clean[0].toppings, ['Kem']);
});

test('Input persist sai kiểu không gây crash', () => {
  assert.deepEqual(mergeCartItems(null), []);
  assert.deepEqual(mergeCartItems({ items: 'broken' }), []);
});

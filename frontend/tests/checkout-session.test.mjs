// Chạy: node --experimental-strip-types --test tests/checkout-session.test.mjs (Node >=22)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECKOUT_SESSION_KEY, jwtSubject, loadCheckoutSession, saveCheckoutSession,
  clearCheckoutSession, isDefinitivePaymentFailure, isPaidOrderStatus,
  cartSignature, completePaidCheckout,
} from '../lib/checkout-session.ts';

const data = new Map();
globalThis.sessionStorage = {
  getItem: (k) => data.get(k) ?? null,
  setItem: (k, v) => data.set(k, v),
  removeItem: (k) => data.delete(k),
};
globalThis.window = { dispatchEvent: () => {} };
globalThis.localStorage = { getItem: () => alice };
function token(id) {
  const part = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${part({alg:'HS256'})}.${part({sub:id})}.fake-signature`;
}
const alice = token(101);
const bob = token(102);
const session = () => ({
  version: 1, subject:'101', cartKey:'cart-A', orderKey:'order-key',
  orderRequest: { items:[{productId:1,size:'M',toppings:[],qty:1}], pointsToRedeem:0 },
  orderId:null, orderTotal:null, pointsRedeemed:null, attempt:null,
});

test('session survives reload and never stores JWT', () => {
  saveCheckoutSession(session());
  assert.deepEqual(loadCheckoutSession(alice), session());
  assert.equal(data.get(CHECKOUT_SESSION_KEY).includes(alice), false);
  assert.equal(loadCheckoutSession(bob), null);
  clearCheckoutSession();
  assert.equal(loadCheckoutSession(alice), null);
});

test('unknown result keeps same order and payment idempotency keys on reload', () => {
  const s = session();
  s.orderId = 55;
  s.orderTotal = 49000;
  s.pointsRedeemed = 120;
  s.attempt = { key:'payment-key-1', method:'CARD', demoDecline:false };
  saveCheckoutSession(s);
  const restored = loadCheckoutSession(alice);
  assert.equal(restored?.orderKey, 'order-key');
  assert.deepEqual(restored?.attempt, s.attempt);
  clearCheckoutSession();
});

test('VNPay attempt survives reload so retry keeps the original order', () => {
  const s = session();
  s.orderId = 1570;
  s.orderTotal = 40000;
  s.pointsRedeemed = 0;
  s.attempt = { key:'vnpay-payment-key-1', method:'VNPAY', demoDecline:false };
  saveCheckoutSession(s);
  const restored = loadCheckoutSession(alice);
  assert.equal(restored?.orderId, 1570);
  assert.deepEqual(restored?.attempt, s.attempt);
  clearCheckoutSession();
});

test('paid is only true for paid or subsequent processing states', () => {
  for (const status of ['PAID','PREPARING','READY','COMPLETED']) assert.equal(isPaidOrderStatus(status), true);
  for (const status of ['PENDING','PAYMENT_FAILED','CANCELLED']) assert.equal(isPaidOrderStatus(status), false);
});

test('known decline/timeout allow a NEW key; uncertain errors keep old key', () => {
  assert.equal(isDefinitivePaymentFailure(402,'PAYMENT_DECLINED'), true);
  assert.equal(isDefinitivePaymentFailure(504,'GATEWAY_TIMEOUT'), true);
  assert.equal(isDefinitivePaymentFailure(409,'PAYMENT_IN_PROGRESS'), false);
  assert.equal(isDefinitivePaymentFailure(500,'PAYMENT_INTERNAL_ERROR'), false);
  assert.equal(isDefinitivePaymentFailure(undefined, undefined), false);
});

test('bad, missing, and unrelated identity cannot restore session', () => {
  saveCheckoutSession(session());
  assert.equal(jwtSubject('corrupt'), null);
  assert.equal(loadCheckoutSession(null), null);
  assert.equal(loadCheckoutSession(bob), null);
  assert.equal(loadCheckoutSession(alice)?.subject, '101');
  clearCheckoutSession();
});

test('verified payment cleans only its own session and matching cart', () => {
  saveCheckoutSession({ ...session(), orderId: 55 });
  let cleared = 0;
  completePaidCheckout(alice, 55, 'cart-A', () => cleared++);
  assert.equal(cleared, 1);
  assert.equal(loadCheckoutSession(alice), null);
});

test('paying an old order preserves a newer cart or a different checkout', () => {
  saveCheckoutSession({ ...session(), orderId: 55 });
  let cleared = 0;
  completePaidCheckout(alice, 55, 'cart-NEW', () => cleared++);
  assert.equal(cleared, 0);
  assert.equal(loadCheckoutSession(alice), null);
  saveCheckoutSession({ ...session(), orderId: 56 });
  completePaidCheckout(alice, 55, 'cart-A', () => cleared++);
  assert.equal(cleared, 0);
  assert.equal(loadCheckoutSession(alice)?.orderId, 56);
  clearCheckoutSession();
});

test('an old account response cannot clear the current account checkout', () => {
  saveCheckoutSession({ ...session(), orderId: 55 });
  globalThis.localStorage = { getItem: () => bob };
  let cleared = 0;
  completePaidCheckout(alice, 55, 'cart-A', () => cleared++);
  assert.equal(cleared, 0);
  assert.equal(loadCheckoutSession(alice)?.orderId, 55);
  globalThis.localStorage = { getItem: () => alice };
  clearCheckoutSession();
});

test('cart signatures keep toppings canonical without hiding a changed price or quantity', () => {
  const item = { productId:1, size:'M', toppings:['Kem','Trân châu'], qty:1, unitPrice:50000 };
  assert.equal(cartSignature([item]), cartSignature([{ ...item, toppings:['Trân châu','Kem'] }]));
  assert.notEqual(cartSignature([item]), cartSignature([{ ...item, qty:2 }]));
  assert.notEqual(cartSignature([item]), cartSignature([{ ...item, unitPrice:55000 }]));
});

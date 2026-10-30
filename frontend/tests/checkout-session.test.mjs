// Chạy: node --experimental-strip-types --test tests/checkout-session.test.mjs (Node >=22)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECKOUT_SESSION_KEY, jwtSubject, loadCheckoutSession, saveCheckoutSession,
  clearCheckoutSession, isDefinitivePaymentFailure, isPaidOrderStatus,
} from '../lib/checkout-session.ts';

const data = new Map();
globalThis.sessionStorage = {
  getItem: (k) => data.get(k) ?? null,
  setItem: (k, v) => data.set(k, v),
  removeItem: (k) => data.delete(k),
};
globalThis.window = { dispatchEvent: () => {} };
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

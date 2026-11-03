import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentProvider, paymentRequest, validCheckoutUrl } from '../lib/payment-client.ts';

test('local mock uses the mock endpoint and includes decline only for mock requests', () => {
  assert.deepEqual(paymentRequest('MOCK', 42, 'CARD', true), {
    path: '/payments', body: JSON.stringify({ orderId:42, method:'CARD', demoDecline:true }),
  });
  for (const provider of ['STRIPE', 'VNPAY']) {
    const request = paymentRequest(provider, 42, provider === 'VNPAY' ? 'VNPAY' : 'CARD', true);
    assert.equal(request.path, '/payments/checkout');
    assert.equal('demoDecline' in JSON.parse(request.body), false);
    assert.equal('amount' in JSON.parse(request.body), false);
  }
});

test('VNPay selects external checkout even when the wallet/card provider is MOCK', () => {
  const config = { provider:'MOCK', mockDeclineEnabled:true };
  assert.equal(paymentProvider(config, 'WALLET'), 'MOCK');
  assert.equal(paymentProvider(config, 'VNPAY'), 'VNPAY');
  assert.equal(paymentProvider({ ...config, provider:'STRIPE' }, 'CARD'), 'STRIPE');
});

test('checkout redirects require HTTPS and Stripe must use the actual Checkout host', () => {
  assert.equal(validCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test', 'STRIPE'), true);
  for (const value of ['javascript:alert(1)', 'http://checkout.stripe.com/test', 'https://checkout.stripe.com.evil.test/x', 'https://user@checkout.stripe.com/x', undefined]) {
    assert.equal(validCheckoutUrl(value, 'STRIPE'), false);
  }
  assert.equal(validCheckoutUrl('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html', 'VNPAY'), true);
  assert.equal(validCheckoutUrl('https://checkout.stripe.com/test', 'MOCK'), false);
});

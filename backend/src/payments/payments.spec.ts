import { describe, expect, it } from 'vitest';
import { paymentRequestHash } from './payments.service.js';
import { assertCreateKey } from '../orders/orders.service.js';

// G-03/G-04: thay TODO bằng kiểm chứng có giá trị; concurrency PostgreSQL ở
// test/rewards.regression.e2e-spec.ts, unit payment ở payments.service.spec.ts.
describe('Idempotency helpers', () => {
  it('hash payment phụ thuộc user, order và method', () => {
    const item = { userId: 1, orderId: 10, method: 'WALLET' };
    const baseline = paymentRequestHash(item);
    expect(paymentRequestHash(item)).toBe(baseline);
    expect(paymentRequestHash({ ...item, userId: 2 })).not.toBe(baseline);
    expect(paymentRequestHash({ ...item, orderId: 11 })).not.toBe(baseline);
    expect(paymentRequestHash({ ...item, method: 'CARD' })).not.toBe(baseline);
  });
  it('orders không nhận header key thiếu hoặc sai định dạng', () => {
    expect(() => assertCreateKey(undefined)).toThrow();
    expect(() => assertCreateKey('key with spaces')).toThrow();
    expect(assertCreateKey(' order-01 ')).toBe('order-01');
  });
});

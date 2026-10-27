import { describe, expect, it } from 'vitest';
import {
  assertCouponConfiguration,
  calculateCouponDiscount,
  calculateEarnedPoints,
  calculateRewardsQuote,
  checkCouponEligibility,
  normalizeCouponCode,
  type CouponRuleInput,
} from './reward-rules.js';

const now = new Date('2026-10-21T00:00:00.000Z');
const sample: CouponRuleInput = {
  code: 'GIAM10', discountPercent: 10, discountAmount: null,
  minOrderValue: 50_000, maxUses: 100, usedCount: 0,
  expiresAt: new Date('2099-01-01T00:00:00.000Z'), active: true,
};

describe('reward-rules - pure functions', () => {
  it('chuẩn hóa mã: trim + uppercase', () => {
    expect(normalizeCouponCode('  gIaM10  ')).toBe('GIAM10');
  });
  it('coupon 10% với 100.000đ giảm đúng 10.000đ', () => {
    expect(calculateCouponDiscount(sample, 100_000)).toBe(10_000);
  });
  it('giảm cố định 15.000đ', () => {
    const fixed = { ...sample, discountPercent: null, discountAmount: 15_000 };
    expect(calculateCouponDiscount(fixed, 100_000)).toBe(15_000);
    expect(calculateCouponDiscount(fixed, 10_000)).toBe(10_000);
  });
  it('chặn coupon khai báo cả hai hoặc không có discount', () => {
    expect(() => assertCouponConfiguration({ ...sample, discountAmount: 1 })).toThrow();
    expect(() => assertCouponConfiguration({ ...sample, discountPercent: null })).toThrow();
  });
  it.each([0, 101, 1.5, NaN])('reject percent = %s', (percent) => {
    expect(() => assertCouponConfiguration({ ...sample, discountPercent: percent })).toThrow();
  });
  it('reject số âm / số thập phân / NaN cho tiền', () => {
    expect(() => calculateCouponDiscount(sample, -1)).toThrow();
    expect(() => calculateCouponDiscount(sample, 10.3)).toThrow();
    expect(() => calculateEarnedPoints(NaN)).toThrow();
  });
  it('reject coupon inactive', () => {
    expect(checkCouponEligibility({ ...sample, active: false }, 100_000, now)).toBe('INACTIVE');
  });
  it('reject coupon expired kể cả ngay giây hết hạn', () => {
    expect(checkCouponEligibility({ ...sample, expiresAt: now }, 100_000, now)).toBe('EXPIRED');
  });
  it('reject dưới min order value', () => {
    expect(checkCouponEligibility(sample, 49_999, now)).toBe('MIN_ORDER_VALUE');
  });
  it('reject khi quota maxUses đã hết', () => {
    expect(checkCouponEligibility({ ...sample, usedCount: 100 }, 100_000, now)).toBe('QUOTA_EXHAUSTED');
  });
  it('quota không giới hạn cho maxUses null', () => {
    expect(checkCouponEligibility({ ...sample, maxUses: null }, 100_000, now)).toBeNull();
  });
  it('thứ tự: coupon rồi points, cap points tại số tiền còn lại', () => {
    expect(calculateRewardsQuote(110_000, 11_000, 5_000)).toEqual({
      couponDiscount: 11_000, pointsDiscount: 5_000,
      totalDiscount: 16_000, total: 94_000,
    });
    expect(calculateRewardsQuote(10_000, 4_000, 8_000).total).toBe(0);
    expect(() => calculateRewardsQuote(1_000, 100, -1)).toThrow();
  });
  it('EARN làm tròn xuống dựa trên số tiền đã trả', () => {
    expect(calculateEarnedPoints(94_000)).toBe(940);
    expect(calculateEarnedPoints(94_099)).toBe(940);
  });
});

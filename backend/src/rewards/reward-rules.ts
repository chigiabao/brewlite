/**
 * Nghiệp vụ Rewards thuần (pure functions).
 * Không dùng NestJS, không truy vấn DB, không phụ thuộc đồng hồ hệ thống.
 * Toàn bộ tiền và điểm tính bằng số nguyên VNĐ, tránh sai số số thực.
 */
export type CouponRuleInput = {
  code: string;
  discountPercent: number | null;
  discountAmount: number | null;
  minOrderValue: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date;
  active: boolean;
};

export type CouponInvalidReason =
  | 'INACTIVE'
  | 'EXPIRED'
  | 'MIN_ORDER_VALUE'
  | 'QUOTA_EXHAUSTED';

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Tránh âm, NaN, số lẻ VNĐ và số vượt miền an toàn của JavaScript. */
export function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} phải là số nguyên không âm an toàn`);
  }
}

export function assertCouponConfiguration(coupon: CouponRuleInput): void {
  const hasPercent = coupon.discountPercent !== null;
  const hasAmount = coupon.discountAmount !== null;
  if (hasPercent === hasAmount) {
    throw new Error(`Coupon ${coupon.code} phải có đúng một loại discount`);
  }
  if (hasPercent) {
    const percent = coupon.discountPercent!;
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
      throw new Error('discountPercent không hợp lệ (1–100)');
    }
  }
  if (hasAmount) {
    const amount = coupon.discountAmount!;
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error('discountAmount không hợp lệ (> 0)');
    }
  }
  assertNonNegativeInteger(coupon.minOrderValue, 'minOrderValue');
  assertNonNegativeInteger(coupon.usedCount, 'usedCount');
  if (coupon.maxUses !== null) {
    assertNonNegativeInteger(coupon.maxUses, 'maxUses');
  }
  if (!(coupon.expiresAt instanceof Date) || Number.isNaN(coupon.expiresAt.getTime())) {
    throw new Error('expiresAt không hợp lệ');
  }
}

/** Chỉ đọc dữ liệu: tuyệt đối KHÔNG tăng usedCount khi xem trước coupon. */
export function checkCouponEligibility(
  coupon: CouponRuleInput,
  subtotal: number,
  now: Date,
): CouponInvalidReason | null {
  assertCouponConfiguration(coupon);
  assertNonNegativeInteger(subtotal, 'subtotal');
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('now không hợp lệ');
  }
  if (!coupon.active) return 'INACTIVE';
  // Đúng thời điểm hết hạn cũng coi là đã hết hạn.
  if (coupon.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (subtotal < coupon.minOrderValue) return 'MIN_ORDER_VALUE';
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return 'QUOTA_EXHAUSTED';
  }
  return null;
}

/**
 * % làm tròn xuống; giảm cố định tối đa bằng subtotal, không âm.
 * Không tự kiểm tra trạng thái active/expiry ở đây: caller gọi checkCouponEligibility.
 */
export function calculateCouponDiscount(coupon: CouponRuleInput, subtotal: number): number {
  assertCouponConfiguration(coupon);
  assertNonNegativeInteger(subtotal, 'subtotal');
  const raw = coupon.discountPercent !== null
    ? Math.floor((subtotal * coupon.discountPercent) / 100)
    : coupon.discountAmount!;
  return Math.min(raw, subtotal);
}

/** 1 điểm = 1 VNĐ; trừ coupon trước, sau đó mới dùng điểm. */
export function calculateRewardsQuote(
  subtotal: number,
  couponDiscount: number,
  pointsRequested = 0,
): { couponDiscount: number; pointsDiscount: number; totalDiscount: number; total: number } {
  assertNonNegativeInteger(subtotal, 'subtotal');
  assertNonNegativeInteger(couponDiscount, 'couponDiscount');
  assertNonNegativeInteger(pointsRequested, 'pointsRequested');
  if (couponDiscount > subtotal) throw new Error('couponDiscount vượt subtotal');
  const remaining = subtotal - couponDiscount;
  const pointsDiscount = Math.min(pointsRequested, remaining);
  return {
    couponDiscount,
    pointsDiscount,
    totalDiscount: couponDiscount + pointsDiscount,
    total: remaining - pointsDiscount,
  };
}

/** Quy ước GUIDE-V2: khoảng 1% giá trị đã thanh toán, làm tròn xuống. */
export function calculateEarnedPoints(totalPaid: number): number {
  assertNonNegativeInteger(totalPaid, 'totalPaid');
  return Math.floor(totalPaid / 100);
}

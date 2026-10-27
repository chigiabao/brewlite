/** Fixture demo, A/B có thể import vào seed.ts; G KHÔNG sửa seed.ts chung. */
export const rewardsCouponSeed = [
  {
    code: 'GIAM10', discountPercent: 10, discountAmount: null,
    minOrderValue: 50_000, maxUses: 100, usedCount: 0,
    expiresAt: new Date('2099-12-31T23:59:59Z'), active: true,
  },
  {
    code: 'FREESHIP', discountPercent: null, discountAmount: 15_000,
    minOrderValue: 0, maxUses: null, usedCount: 0,
    expiresAt: new Date('2099-12-31T23:59:59Z'), active: true,
  },
];
/** Cần chủ động duyệt việc reset usedCount nếu dùng upsert update ở DB thật. */

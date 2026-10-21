/** Public surface cho E/F sử dụng, tránh import file nội bộ của G. */
export { RewardsModule } from './rewards.module.js';
export { RewardsService } from './rewards.service.js';
export type { CouponValidationResult, RewardsBalance } from './rewards.service.js';
export { calculateCouponDiscount, calculateEarnedPoints, normalizeCouponCode } from './reward-rules.js';

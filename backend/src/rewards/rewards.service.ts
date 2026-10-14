import { Injectable, NotImplementedException } from '@nestjs/common';
import { ValidateCouponDto } from './rewards.dto.js';

/** G sở hữu Rewards. Chưa làm nghiệp vụ; service chỉ là vị trí cắm module. */
@Injectable()
export class RewardsService {
  validateCoupon(_dto: ValidateCouponDto) {
    // TODO(G): kiểm tra hết hạn, minOrderValue, maxUses; không tăng usedCount khi chỉ validate.
    throw new NotImplementedException('G chưa hiện thực coupon validation');
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  calculateCouponDiscount,
  checkCouponEligibility,
  normalizeCouponCode,
  type CouponInvalidReason,
} from './reward-rules.js';
import type { ValidateCouponDto } from './rewards.dto.js';

export type CouponValidationResult = { valid: true; discount: number };
export type RewardsBalance = { loyaltyPoints: number };

const COUPON_ERRORS: Record<CouponInvalidReason, string> = {
  INACTIVE: 'Mã giảm giá không hoạt động',
  EXPIRED: 'Mã giảm giá đã hết hạn',
  MIN_ORDER_VALUE: 'Đơn hàng chưa đạt giá trị tối thiểu',
  QUOTA_EXHAUSTED: 'Mã giảm giá đã hết lượt sử dụng',
};

@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Đọc coupon để trả quote. KHÔNG increment usedCount, KHÔNG tạo Order.
   * E phải kiểm tra lại và reserve atomically khi thật sự tạo đơn.
   */
  async validateCoupon(dto: ValidateCouponDto): Promise<CouponValidationResult> {
    const code = normalizeCouponCode(dto.code);
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    if (!coupon) throw new NotFoundException('Không tìm thấy mã giảm giá');

    // Hàm thuần sẽ fail-closed nếu bản ghi coupon trong DB cấu hình sai.
    const reason = checkCouponEligibility(coupon, dto.orderTotal, new Date());
    if (reason) {
      const message = reason === 'MIN_ORDER_VALUE'
        ? `${COUPON_ERRORS[reason]} ${coupon.minOrderValue}`
        : COUPON_ERRORS[reason];
      throw new BadRequestException(message);
    }

    return { valid: true, discount: calculateCouponDiscount(coupon, dto.orderTotal) };
  }

  /** Endpoint này bắt buộc guard JWT; không nhận userId từ request body. */
  async getBalance(userId: number): Promise<RewardsBalance> {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new BadRequestException('userId không hợp lệ');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { loyaltyPoints: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return { loyaltyPoints: user.loyaltyPoints };
  }
}

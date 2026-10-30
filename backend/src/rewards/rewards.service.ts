import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LoyaltyKind } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  calculateCouponDiscount,
  calculateEarnedPoints,
  calculateRewardsQuote,
  checkCouponEligibility,
  normalizeCouponCode,
  assertNonNegativeInteger,
  type CouponInvalidReason,
} from './reward-rules.js';
import type { ValidateCouponDto } from './rewards.dto.js';
import type {
  ReserveParams,
  ReserveResult,
  RewardsTx,
} from './rewards-port.js';

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
  private readonly logger = new Logger(RewardsService.name);

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
      const message =
        reason === 'MIN_ORDER_VALUE'
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

  /**
   * Atomically reserve coupon quota và trừ loyalty points.
   * Phải được gọi trong cùng transaction tạo Order (E sở hữu transaction).
   *
   * Throws:
   *  - 400 nếu coupon không hợp lệ (inactive/expired/min-order/quota hết)
   *  - 409 ConflictException nếu race condition khiến quota hết giữa chừng
   *  - 400 nếu user không đủ điểm để redeem
   */
  async reserveCouponAndPoints(
    params: ReserveParams,
    tx: RewardsTx,
  ): Promise<ReserveResult> {
    const { userId, subtotal, couponCode, pointsToRedeem = 0 } = params;
    assertNonNegativeInteger(subtotal, 'subtotal');
    assertNonNegativeInteger(pointsToRedeem, 'pointsToRedeem');

    // --- Coupon ---
    let couponDiscount = 0;
    if (couponCode && couponCode.trim() !== '') {
      const code = normalizeCouponCode(couponCode);
      const coupon = await tx.coupon.findUnique({ where: { code } });
      if (!coupon) throw new NotFoundException('Không tìm thấy mã giảm giá');

      const reason = checkCouponEligibility(coupon, subtotal, new Date());
      if (reason) {
        const message =
          reason === 'MIN_ORDER_VALUE'
            ? `${COUPON_ERRORS[reason]} ${coupon.minOrderValue}`
            : COUPON_ERRORS[reason];
        throw new BadRequestException(message);
      }

      couponDiscount = calculateCouponDiscount(coupon, subtotal);

      // Optimistic reserve: chỉ increment nếu usedCount chưa đạt maxUses.
      // updateMany trả về count = 0 nếu điều kiện where không thỏa → quota hết do race.
      const updated = await tx.coupon.updateMany({
        where: {
          code,
          ...(coupon.maxUses !== null ? { usedCount: { lt: coupon.maxUses } } : {}),
        },
        data: { usedCount: { increment: 1 } },
      });

      if (updated.count === 0) {
        this.logger.warn(`coupon.race.quota_exhausted code=${code}`);
        throw new ConflictException(COUPON_ERRORS['QUOTA_EXHAUSTED']);
      }

      this.logger.log(`coupon.reserved code=${code} userId=${userId}`);
    }

    // Tính số điểm THỰC được sử dụng trước khi trừ balance.
    // Ví dụ còn 27.000đ, yêu cầu 30.000 điểm -> chỉ reserve 27.000.
    const quote = calculateRewardsQuote(subtotal, couponDiscount, pointsToRedeem);
    if (quote.pointsDiscount > 0) {
      const updated = await tx.user.updateMany({
        where: { id: userId, loyaltyPoints: { gte: quote.pointsDiscount } },
        data: { loyaltyPoints: { decrement: quote.pointsDiscount } },
      });
      if (updated.count !== 1) {
        throw new BadRequestException('Không đủ điểm loyalty để đổi');
      }
      this.logger.log(`points.reserved userId=${userId} points=${quote.pointsDiscount}`);
    }
    return quote;
  }

  /**
   * Hoàn lại nguồn lực khi E chuyển PENDING/PAYMENT_FAILED -> CANCELLED.
   * Chỉ được gọi sau CAS đổi trạng thái thành công, trong CÙNG transaction
   * hủy đơn + hoàn stock. CAS là hàng rào exactly-once; method này không
   * được gọi trực tiếp từ controller hay khi đơn đã PAID.
   *
   * REDEEM entry được giữ làm chứng từ lịch sử: CANCELLED xác nhận việc
   * reserve đã được hoàn. Không phát sinh EARN cho đơn chưa PAID.
   */
  async releaseReservedOnCancel(
    params: { orderId: number; userId: number; couponCode: string | null; pointsRedeemed: number },
    tx: RewardsTx,
  ): Promise<void> {
    const { orderId, userId, couponCode, pointsRedeemed } = params;
    assertNonNegativeInteger(pointsRedeemed, 'pointsRedeemed');

    if (couponCode?.trim()) {
      const code = normalizeCouponCode(couponCode);
      const released = await tx.coupon.updateMany({
        where: { code, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
      if (released.count !== 1) {
        throw new ConflictException('COUPON_RESERVATION_NOT_FOUND');
      }
      this.logger.log(`coupon.released orderId=${orderId} code=${code}`);
    }

    if (pointsRedeemed > 0) {
      const refunded = await tx.user.updateMany({
        where: { id: userId },
        data: { loyaltyPoints: { increment: pointsRedeemed } },
      });
      if (refunded.count !== 1) {
        throw new ConflictException('REWARDS_USER_NOT_FOUND');
      }
      this.logger.log(`points.released orderId=${orderId} userId=${userId} points=${pointsRedeemed}`);
    }
  }

  /**
   * Tạo LoyaltyEntry REDEEM cho order vừa tạo.
   * E gọi method này sau khi insert Order (đã có orderId) trong cùng transaction.
   * Chỉ gọi nếu pointsRedeemed > 0.
   */
  async createRedeemEntry(
    params: { orderId: number; userId: number; points: number },
    tx: RewardsTx,
  ): Promise<void> {
    if (params.points <= 0) return;
    await tx.loyaltyEntry.create({
      data: {
        userId: params.userId,
        orderId: params.orderId,
        kind: LoyaltyKind.REDEEM,
        points: params.points,
      },
    });
    this.logger.log(
      `loyalty.redeem.entry orderId=${params.orderId} userId=${params.userId} points=${params.points}`,
    );
  }

  /**
   * Cộng điểm loyalty sau khi Order PAID — chính xác 1 lần nhờ unique constraint.
   * F phải gọi trong cùng transaction markPaid.
   *
   * Idempotent: LoyaltyEntry unique([orderId, kind=EARN]) chặn double-earn.
   * Nếu đã tồn tại (idempotent replay), method này return sớm mà không throw.
   */
  async finalizeRewardsOnPaid(
    params: { orderId: number; userId: number; totalPaid: number },
    tx: RewardsTx,
  ): Promise<{ pointsEarned: number }> {
    const { orderId, userId, totalPaid } = params;
    const pointsEarned = calculateEarnedPoints(totalPaid);

    if (pointsEarned <= 0) {
      return { pointsEarned: 0 };
    }

    // Kiểm tra đã EARN chưa (idempotency guard thủ công để tránh throw P2002 ra ngoài).
    const existing = await tx.loyaltyEntry.findUnique({
      where: { orderId_kind: { orderId, kind: LoyaltyKind.EARN } },
    });
    if (existing) {
      this.logger.warn(`loyalty.earn.duplicate orderId=${orderId} — skipped`);
      return { pointsEarned: existing.points };
    }

    await tx.loyaltyEntry.create({
      data: {
        userId,
        orderId,
        kind: LoyaltyKind.EARN,
        points: pointsEarned,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { loyaltyPoints: { increment: pointsEarned } },
    });

    this.logger.log(
      `loyalty.earn orderId=${orderId} userId=${userId} points=${pointsEarned}`,
    );
    return { pointsEarned };
  }
}

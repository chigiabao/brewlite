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

    // --- Points redeem ---
    let pointsDiscount = 0;
    if (pointsToRedeem > 0) {
      // Đọc số điểm hiện tại; dùng updateMany để atomically kiểm tra và trừ.
      const updated = await tx.user.updateMany({
        where: { id: userId, loyaltyPoints: { gte: pointsToRedeem } },
        data: { loyaltyPoints: { decrement: pointsToRedeem } },
      });

      if (updated.count === 0) {
        throw new BadRequestException('Không đủ điểm loyalty để đổi');
      }

      // Tạo LoyaltyEntry REDEEM; unique([orderId, kind]) sẽ được enforce sau khi Order được tạo.
      // Tại bước reserve, chưa có orderId nên entry này được tạo sau khi Order insert bởi E.
      // G chỉ trừ điểm user ở đây; E sẽ tạo LoyaltyEntry REDEEM sau khi có orderId.
      pointsDiscount = pointsToRedeem;
      this.logger.log(`points.reserved userId=${userId} points=${pointsToRedeem}`);
    }

    const quote = calculateRewardsQuote(subtotal, couponDiscount, pointsDiscount);
    return quote;
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

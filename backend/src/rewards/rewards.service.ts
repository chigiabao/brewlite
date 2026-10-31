import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LoyaltyKind, OrderStatus } from '../generated/prisma/enums.js';
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
          active: true,
          expiresAt: { gt: new Date() },
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
    // Coupon được trừ trước; điểm yêu cầu vượt phần còn lại chỉ reserve phần có thể dùng.
    // Không được trừ balance nhiều hơn pointsRedeemed snapshot.
    const pointsDiscount = calculateRewardsQuote(
      subtotal,
      couponDiscount,
      pointsToRedeem,
    ).pointsDiscount;
    if (pointsDiscount > 0) {
      // Đọc số điểm hiện tại; dùng updateMany để atomically kiểm tra và trừ.
      const updated = await tx.user.updateMany({
        where: { id: userId, loyaltyPoints: { gte: pointsDiscount } },
        data: { loyaltyPoints: { decrement: pointsDiscount } },
      });

      if (updated.count === 0) {
        const current = await tx.user.findUnique({
          where: { id: userId },
          select: { loyaltyPoints: true },
        });
        if (current && current.loyaltyPoints >= pointsDiscount) {
          throw new ConflictException('Điểm vừa được sử dụng. Vui lòng thử lại.');
        }
        throw new BadRequestException('Không đủ điểm loyalty để đổi');
      }

      // Chỉ giữ balance ở PENDING; REDEEM sẽ được ghi sau PAID.
      this.logger.log(`points.reserved userId=${userId} points=${pointsDiscount}`);
    }

    const quote = calculateRewardsQuote(subtotal, couponDiscount, pointsDiscount);
    return quote;
  }

  /**
   * G-03: tại PENDING chỉ GIỮ điểm bằng cách trừ balance, không ghi REDEEM.
   * REDEEM chỉ được ghi cùng transaction chuyển đơn sang PAID.
   */
  async createRedeemEntry(
    params: { orderId: number; userId: number; points: number },
    tx: RewardsTx,
  ): Promise<void> {
    if (params.points <= 0) return;
    const order = await tx.order.findUnique({
      where: { id: params.orderId },
      select: { status: true, userId: true, pointsRedeemed: true },
    });
    if (!order || order.status !== OrderStatus.PAID ||
      order.userId !== params.userId || order.pointsRedeemed !== params.points) {
      throw new ConflictException('Chỉ ghi REDEEM cho đơn PAID với đúng số điểm đã giữ');
    }
    await tx.loyaltyEntry.createMany({
      data: [{ userId: params.userId, orderId: params.orderId,
        kind: LoyaltyKind.REDEEM, points: params.points }],
      skipDuplicates: true,
    });
  }

  /** G-04: chỉ gọi sau CAS PENDING/PAYMENT_FAILED → CANCELLED trong cùng transaction.
   * Quota, điểm và tồn kho được hoàn đúng một lần nhờ điều kiện CAS ở OrdersService.
   */
  async releaseOnCancel(orderId: number, userId: number, tx: RewardsTx): Promise<void> {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { userId: true, status: true, couponCode: true, pointsRedeemed: true },
    });
    if (!order || order.userId !== userId || order.status !== OrderStatus.CANCELLED) {
      throw new ConflictException('Chỉ hoàn rewards cho đơn đã CANCELLED');
    }
    if (order.pointsRedeemed > 0) {
      await tx.user.update({ where: { id: userId },
        data: { loyaltyPoints: { increment: order.pointsRedeemed } } });
    }
    if (order.couponCode) {
      const released = await tx.coupon.updateMany({
        where: { code: order.couponCode, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
      if (released.count !== 1) throw new ConflictException('Không thể hoàn lượt coupon');
    }
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
    // Caller must transition to PAID in this same transaction. Verify the stored
    // snapshot so a stale callback cannot earn for another user or amount.
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { userId: true, status: true, total: true, pointsRedeemed: true },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Không tìm thấy đơn hàng của bạn');
    }
    if (order.status !== OrderStatus.PAID || order.total !== totalPaid) {
      throw new ConflictException('Rewards chỉ được finalize theo tổng tiền của đơn đã PAID');
    }
    // G-03: REDEEM + EARN và trạng thái PAID nằm trong cùng transaction.
    await this.createRedeemEntry({ orderId, userId, points: order.pointsRedeemed }, tx);
    const pointsEarned = calculateEarnedPoints(order.total);

    if (pointsEarned <= 0) {
      return { pointsEarned: 0 };
    }

    // skipDuplicates biến unique(orderId, kind) thành exactly-once guard ngay
    // cả khi hai payment callbacks chạy đồng thời trong cùng database.
    const inserted = await tx.loyaltyEntry.createMany({
      data: [{
        userId,
        orderId,
        kind: LoyaltyKind.EARN,
        points: pointsEarned,
      }],
      skipDuplicates: true,
    });

    if (inserted.count === 0) {
      const existing = await tx.loyaltyEntry.findUnique({
        where: { orderId_kind: { orderId, kind: LoyaltyKind.EARN } },
      });
      this.logger.warn(`loyalty.earn.duplicate orderId=${orderId} — skipped`);
      return { pointsEarned: existing?.points ?? pointsEarned };
    }

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

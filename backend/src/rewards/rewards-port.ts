/**
 * Port interface G xuất cho E và F dùng.
 * E/F chỉ import từ file này (hoặc rewards/public.ts), không import internals.
 *
 * Quy tắc ranh giới module (FOUNDATION-V1 §2):
 *   - E gọi reserveCouponAndPoints khi tạo Order, releaseReservedOnCancel khi hủy.
 *   - F gọi finalizeRewardsOnPaid trong cùng $transaction markPaid.
 *   - G không tự sửa orders.service.ts hay payments.service.ts.
 */
import type { Prisma } from '../generated/prisma/client.js';

export const REWARDS_PORT = Symbol('REWARDS_PORT');

export type RewardsTx = Prisma.TransactionClient;

/** Kết quả tính giá sau khi reserve thành công (snapshot vào Order). */
export type ReserveResult = {
  couponDiscount: number;
  pointsDiscount: number;
  totalDiscount: number;
  /** total = subtotal - totalDiscount, không âm */
  total: number;
};

export type ReserveParams = {
  userId: number;
  subtotal: number;
  /** undefined hoặc chuỗi rỗng = không dùng coupon */
  couponCode?: string;
  /** undefined hoặc 0 = không đổi điểm */
  pointsToRedeem?: number;
};

/**
 * Interface port cho E và F gọi.
 * Tất cả method nhận Prisma.TransactionClient để đảm bảo atomic với caller.
 */
export interface RewardsPort {
  /**
   * Atomically reserve coupon quota và trừ loyalty points.
   * Phải được gọi trong cùng transaction tạo Order (E sở hữu transaction).
   *
   * Throws:
   *  - 400 nếu coupon không hợp lệ (inactive/expired/min-order/quota hết)
   *  - 409 nếu race condition khiến quota hết giữa chừng
   *  - 400 nếu user không đủ điểm để redeem
   */
  reserveCouponAndPoints(params: ReserveParams, tx: RewardsTx): Promise<ReserveResult>;

  /** Hoàn đúng số điểm/quota đã reserve nếu E hủy Order bằng CAS thành công. */
  releaseReservedOnCancel(
    params: { orderId: number; userId: number; couponCode: string | null; pointsRedeemed: number },
    tx: RewardsTx,
  ): Promise<void>;

  /**
   * Finalize REDEEM (nếu có) và EARN CHỈ sau khi Order đã PAID.
   * Phải được gọi trong cùng transaction markPaid (F sở hữu transaction).
   * pointsRedeemed lấy từ snapshot Order trong transaction, không từ frontend.
   *
   * Nếu LoyaltyEntry EARN đã tồn tại, trả kết quả cũ, không cộng trùng.
   */
  finalizeRewardsOnPaid(
    params: { orderId: number; userId: number; totalPaid: number; pointsRedeemed: number },
    tx: RewardsTx,
  ): Promise<{ pointsEarned: number }>;

  /**
   * Reverse loyalty for a fully refunded order, exactly once per order.
   * EARN points are clawed back and unspent REDEEM points are restored.
   * A negative balance is allowed so a refund is never blocked by spent points.
   */
  refundRewardsOnRefund(
    params: {
      orderId: number;
      userId: number;
      pointsRedeemed: number;
      restoreRedeemedPoints: boolean;
    },
    tx: RewardsTx,
  ): Promise<{ pointsDelta: number; alreadyProcessed: boolean }>;
}

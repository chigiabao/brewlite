/**
 * Port interface G xuất cho E và F dùng.
 * E/F chỉ import từ file này (hoặc rewards/public.ts), không import internals.
 *
 * Quy tắc ranh giới module (FOUNDATION-V1 §2):
 *   - E gọi reserveCouponAndPoints trong cùng $transaction tạo Order.
 *   - F gọi finalizeRewardsOnPaid trong cùng $transaction markPaid.
 *   - Bản tích hợp G-03/G-04 thay đổi E/F có kiểm soát để giữ transaction nhất quán.
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

  /** Ghi audit REDEEM khi Order đã PAID trong cùng transaction thanh toán. */
  createRedeemEntry(
    params: { orderId: number; userId: number; points: number },
    tx: RewardsTx,
  ): Promise<void>;

  /** Hoàn quota/điểm cho đơn vừa chuyển CANCELLED; gọi cùng transaction hủy. */
  releaseOnCancel(orderId: number, userId: number, tx: RewardsTx): Promise<void>;

  /**
   * Cộng điểm loyalty sau khi Order PAID — chính xác 1 lần nhờ unique constraint.
   * Phải được gọi trong cùng transaction markPaid (F sở hữu transaction).
   *
   * Gọi lại an toàn; unique constraint + skipDuplicates ngăn cộng điểm lần hai.
   * Xác minh user, trạng thái PAID và totalPaid khớp snapshot trong Order.
   */
  finalizeRewardsOnPaid(
    params: { orderId: number; userId: number; totalPaid: number },
    tx: RewardsTx,
  ): Promise<{ pointsEarned: number }>;
}

import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '../generated/prisma/enums.js';

/**
 * E — Máy trạng thái đơn hàng theo GUIDE-V2.
 *
 * Luồng chuẩn: PENDING → PAID → PREPARING → READY → COMPLETED.
 * Ngoại lệ: PAYMENT_FAILED cho phép thử thanh toán lại; CANCELLED kết thúc đơn.
 * Mọi thao tác đổi trạng thái phải kiểm tra ở đây và cập nhật DB có điều kiện.
 */
export const ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: [OrderStatus.PAID, OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED],
  PAYMENT_FAILED: [OrderStatus.PENDING, OrderStatus.CANCELLED],
  PAID: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY],
  READY: [OrderStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
};

/** Các trạng thái pha chế mà nghiệp vụ nội bộ E được quyền chuyển tới. */
export type PreparationStatus =
  | typeof OrderStatus.PREPARING
  | typeof OrderStatus.READY
  | typeof OrderStatus.COMPLETED;

/**
 * Không cho thao tác pha chế sửa PAID, PENDING, PAYMENT_FAILED hay CANCELLED.
 * Trạng thái thanh toán thuộc F; việc hủy và hoàn tài nguyên dùng luồng riêng của E.
 */
export function assertPreparationTarget(to: OrderStatus): asserts to is PreparationStatus {
  if (
    to !== OrderStatus.PREPARING &&
    to !== OrderStatus.READY &&
    to !== OrderStatus.COMPLETED
  ) {
    throw new ConflictException('ORDER_PREPARATION_TARGET_INVALID');
  }
}

/** Từ chối mọi bước nhảy cóc, bước lùi hoặc chuyển tiếp từ trạng thái kết thúc. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!ALLOWED[from]?.includes(to)) {
    throw new ConflictException(`Invalid order status transition: ${from} -> ${to}`);
  }
}

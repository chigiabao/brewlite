import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '../generated/prisma/enums.js';

/** G-04: chỉ chấp nhận mũi tên có trong sơ đồ; không cho nhảy cóc hay quay lui. */
export const ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: [OrderStatus.PAID, OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED],
  PAYMENT_FAILED: [OrderStatus.PAID, OrderStatus.CANCELLED],
  PAID: [OrderStatus.PREPARING],
  PREPARING: [OrderStatus.READY],
  READY: [OrderStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!ALLOWED[from]?.includes(to)) {
    throw new BadRequestException(`Không thể chuyển trạng thái đơn hàng ${from} → ${to}`);
  }
}

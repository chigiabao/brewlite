import { OrderStatus } from '../generated/prisma/enums.js';

// Người phụ trách: E (Task 10.1 – Order State Machine)
// Luồng: PENDING → PAID → PREPARING → READY → COMPLETED
// Ngoại lệ: PAYMENT_FAILED (thử lại được), CANCELLED. COMPLETED và CANCELLED là trạng thái kết thúc.
// Mọi chỗ đổi order.status phải gọi assertTransition() trước.

// TODO(E): điền các chuyển tiếp hợp lệ theo sơ đồ ở mục 9.1 của đề.
export const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [],
  PAID: [],
  PAYMENT_FAILED: [],
  PREPARING: [],
  READY: [],
  COMPLETED: [],
  CANCELLED: [],
};

// TODO(E): ném BadRequestException nếu from → to không có trong ALLOWED.
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  void from;
  void to;
}

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OrderExpiryService } from './order-expiry.service.js';
import { OrderStatus } from '../generated/prisma/enums.js';

describe('OrderExpiryService', () => {
  let service: OrderExpiryService;

  const prisma = {
    order: {
      findMany: vi.fn(),
    },
  };

  const orders = {
    cancelExpired: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ENABLE_ORDER_AUTO_CANCEL;
    service = new OrderExpiryService(prisma as never, orders as never);
  });

  it('hủy các đơn PENDING/PAYMENT_FAILED quá hạn cancelAfter', async () => {
    const now = new Date('2026-10-30T10:00:00Z');
    prisma.order.findMany.mockResolvedValue([{ id: 101 }, { id: 102 }]);
    orders.cancelExpired
      .mockResolvedValueOnce({ cancelled: true, orderId: 101 })
      .mockResolvedValueOnce({ cancelled: true, orderId: 102 });

    const cancelledCount = await service.cancelExpiredOrders(now);

    expect(cancelledCount).toBe(2);
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED] },
        cancelAfter: { lte: now },
      },
      select: { id: true },
      orderBy: { cancelAfter: 'asc' },
      take: 50,
    });
    expect(orders.cancelExpired).toHaveBeenCalledTimes(2);
  });

  it('bỏ qua khi feature flag ENABLE_ORDER_AUTO_CANCEL=false', async () => {
    process.env.ENABLE_ORDER_AUTO_CANCEL = 'false';
    const now = new Date('2026-10-30T10:00:00Z');

    const cancelledCount = await service.cancelExpiredOrders(now);

    expect(cancelledCount).toBe(0);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('không tăng số lượng khi orders.cancelExpired trả về cancelled=false (race condition)', async () => {
    const now = new Date('2026-10-30T10:00:00Z');
    prisma.order.findMany.mockResolvedValue([{ id: 103 }]);
    orders.cancelExpired.mockResolvedValueOnce({
      cancelled: false,
      reason: 'payment-in-progress',
      orderId: 103,
    });

    const cancelledCount = await service.cancelExpiredOrders(now);

    expect(cancelledCount).toBe(0);
    expect(orders.cancelExpired).toHaveBeenCalledWith(103, now);
  });

  it('xử lý lỗi đơn lẻ không làm gián đoạn toàn bộ batch', async () => {
    const now = new Date('2026-10-30T10:00:00Z');
    prisma.order.findMany.mockResolvedValue([{ id: 104 }, { id: 105 }]);
    orders.cancelExpired
      .mockRejectedValueOnce(new Error('DB lock timeout'))
      .mockResolvedValueOnce({ cancelled: true, orderId: 105 });

    const cancelledCount = await service.cancelExpiredOrders(now);

    expect(cancelledCount).toBe(1);
    expect(orders.cancelExpired).toHaveBeenCalledTimes(2);
  });
});

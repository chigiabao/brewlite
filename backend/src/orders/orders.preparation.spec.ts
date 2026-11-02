import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus } from '../generated/prisma/enums.js';
import { OrdersService } from './orders.service.js';

/** FIX 08 — Kiểm thử luồng pha chế không phụ thuộc HTTP/DB thật. */
describe('FIX 08 — chuyển trạng thái pha chế an toàn', () => {
  const order = {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  };
  const prisma = { order };
  const stock = { reserve: vi.fn(), release: vi.fn() };
  const service = new OrdersService(prisma as never, stock as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cho phép đầy đủ PAID → PREPARING → READY → COMPLETED', async () => {
    let status: OrderStatus = OrderStatus.PAID;
    order.findUnique.mockImplementation(async () => ({ id: 101, status }));
    order.updateMany.mockImplementation(async ({ where, data }) => {
      if (status !== where.status) return { count: 0 };
      status = data.status;
      return { count: 1 };
    });

    await expect(service.advancePreparation(101, OrderStatus.PREPARING))
      .resolves.toEqual({ id: 101, status: OrderStatus.PREPARING });
    await expect(service.advancePreparation(101, OrderStatus.READY))
      .resolves.toEqual({ id: 101, status: OrderStatus.READY });
    await expect(service.advancePreparation(101, OrderStatus.COMPLETED))
      .resolves.toEqual({ id: 101, status: OrderStatus.COMPLETED });

    expect(status).toBe(OrderStatus.COMPLETED);
    expect(order.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 101, status: OrderStatus.PAID },
      data: { status: OrderStatus.PREPARING },
    });
    expect(order.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 101, status: OrderStatus.PREPARING },
      data: { status: OrderStatus.READY },
    });
    expect(order.updateMany).toHaveBeenNthCalledWith(3, {
      where: { id: 101, status: OrderStatus.READY },
      data: { status: OrderStatus.COMPLETED },
    });
  });

  it.each([
    [OrderStatus.PENDING, OrderStatus.PREPARING],
    [OrderStatus.PAYMENT_FAILED, OrderStatus.PREPARING],
    [OrderStatus.PAID, OrderStatus.READY],
    [OrderStatus.PAID, OrderStatus.COMPLETED],
    [OrderStatus.PREPARING, OrderStatus.COMPLETED],
    [OrderStatus.READY, OrderStatus.PREPARING],
    [OrderStatus.COMPLETED, OrderStatus.PREPARING],
    [OrderStatus.CANCELLED, OrderStatus.PREPARING],
  ])('chặn chuyển sai %s → %s; không ghi vào DB', async (from, to) => {
    order.findUnique.mockResolvedValue({ id: 101, status: from });
    await expect(service.advancePreparation(101, to)).rejects.toBeInstanceOf(ConflictException);
    expect(order.updateMany).not.toHaveBeenCalled();
  });

  it('không cho dùng API nội bộ để tự chuyển sang PAID hay CANCELLED', async () => {
    await expect(service.advancePreparation(101, OrderStatus.PAID as never))
      .rejects.toThrow('ORDER_PREPARATION_TARGET_INVALID');
    await expect(service.advancePreparation(101, OrderStatus.CANCELLED as never))
      .rejects.toThrow('ORDER_PREPARATION_TARGET_INVALID');
    expect(order.findUnique).not.toHaveBeenCalled();
    expect(order.updateMany).not.toHaveBeenCalled();
  });

  it('đơn không tồn tại → 404, tuyệt đối không cập nhật', async () => {
    order.findUnique.mockResolvedValue(null);
    await expect(service.advancePreparation(404, OrderStatus.PREPARING))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(order.updateMany).not.toHaveBeenCalled();
  });

  it('CAS thua do trạng thái đã đổi → 409, không trả thành công giả', async () => {
    order.findUnique.mockResolvedValue({ id: 101, status: OrderStatus.PAID });
    order.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.advancePreparation(101, OrderStatus.PREPARING))
      .rejects.toThrow('ORDER_STATUS_CHANGED');
  });

  it('hai request đồng thời đọc cùng trạng thái: đúng một request chuyển thành công', async () => {
    let status: OrderStatus = OrderStatus.PAID;
    let readCount = 0;
    let releaseReaders!: () => void;
    const allRead = new Promise<void>((resolve) => { releaseReaders = resolve; });

    // Cả hai cùng thấy PAID trước khi bất kỳ ai cập nhật.
    order.findUnique.mockImplementation(async () => {
      const snapshot = status;
      readCount++;
      if (readCount === 2) releaseReaders();
      await allRead;
      return { id: 101, status: snapshot };
    });
    order.updateMany.mockImplementation(async ({ where, data }) => {
      if (status !== where.status) return { count: 0 };
      status = data.status;
      return { count: 1 };
    });

    const results = await Promise.allSettled([
      service.advancePreparation(101, OrderStatus.PREPARING),
      service.advancePreparation(101, OrderStatus.PREPARING),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(status).toBe(OrderStatus.PREPARING);
    expect(order.updateMany).toHaveBeenCalledTimes(2);
  });
});

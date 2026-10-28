import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MockOrdersPaymentAdapter } from './orders-payment.port.js';

function setup(status: OrderStatus = OrderStatus.PENDING, updateCount = 1) {
  const prisma = {
    order: {
      findUnique: vi.fn(async () => ({ status })),
      updateMany: vi.fn(async () => ({ count: updateCount })),
    },
  };

  const adapter = new MockOrdersPaymentAdapter(
    prisma as unknown as PrismaService,
  );

  return { adapter, prisma };
}

describe('MockOrdersPaymentAdapter', () => {
  it('chuyển PENDING -> PAID thành công', async () => {
    const { adapter, prisma } = setup(OrderStatus.PENDING);

    await adapter.markPaid(10, 1);

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 10, status: OrderStatus.PENDING },
      data: { status: OrderStatus.PAID },
    });
  });

  it('chặn chuyển trạng thái không hợp lệ', async () => {
    const { adapter, prisma } = setup(OrderStatus.PENDING);

    await expect(adapter.markPaid(10, 1)).resolves.toBeUndefined();

    // Kiểm tra transition không hợp lệ riêng
    const invalid = setup(OrderStatus.COMPLETED);

    await expect(invalid.adapter.markPaid(10, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(invalid.prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
  });

  it('CAS thất bại khi trạng thái đã thay đổi', async () => {
    const { adapter } = setup(OrderStatus.PENDING, 0);

    await expect(adapter.markPaid(10, 1)).rejects.toMatchObject({
      code: 'ORDER_NOT_PAYABLE',
      status: 409,
    });
  });

  it('không tìm thấy order', async () => {
    const prisma = {
      order: {
        findUnique: vi.fn(async () => null),
        updateMany: vi.fn(),
      },
    };

    const adapter = new MockOrdersPaymentAdapter(
      prisma as unknown as PrismaService,
    );

    await expect(adapter.markPaid(10, 1)).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
    });

    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });
});

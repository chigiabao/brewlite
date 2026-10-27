import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersService } from './orders.service.js';
import { StockService } from './stock.service.js';
import { createHash } from 'node:crypto';
import type { CreateOrderDto } from './orders.dto.js';

describe('OrdersService', () => {
  let service: OrdersService;

  const prisma = {
    $transaction: vi.fn(),
    order: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  };

  const stock = {
    reserve: vi.fn(),
    release: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new OrdersService(
      prisma as never,
      stock as unknown as StockService,
    );
  });

  it('trả về danh sách đơn hàng của đúng người dùng, mới nhất trước', async () => {
    const orders = [
      {
        id: 2,
        status: 'PENDING',
        total: 45000,
        createdAt: new Date('2026-10-18T10:00:00Z'),
      },
    ];

    prisma.order.findMany.mockResolvedValue(orders);

    await expect(service.findMine(7)).resolves.toEqual(orders);

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { userId: 7 },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        total: true,
        createdAt: true,
      },
    });
  });

  it('không tạo đơn hàng nếu không tìm thấy đủ sản phẩm', async () => {
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          product: {
            findMany: vi.fn().mockResolvedValue([]),
          },
          order: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        }),
    );

    await expect(
      service.create(
        7,
        {
          items: [
            {
              productId: 999,
              size: 'M',
              toppings: [],
              qty: 1,
            },
          ],
        },
        'missing-product-test',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(stock.reserve).not.toHaveBeenCalled();
  });

  it('tự tính giá từ database và lưu snapshot vào OrderItem', async () => {
    const product = {
      id: 1,
      name: 'Milk Tea',
      price: 30000,
      stock: 10,
      version: 0,
    };

    const createdOrder = {
      id: 10,
      status: 'PENDING',
      subtotal: 45000,
      discountTotal: 0,
      pointsRedeemed: 0,
      total: 45000,
    };

    const tx = {
      product: {
        findMany: vi.fn().mockResolvedValue([product]),
      },
      order: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdOrder),
      },
    };

    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) => callback(tx),
    );

    stock.reserve.mockResolvedValue(undefined);

    const result = await service.create(
      7,
      {
        items: [
          {
            productId: 1,
            size: 'M',
            toppings: ['Trân châu'],
            qty: 1,
          },
        ],
      },
      'create-order-test',
    );

    expect(result).toEqual(createdOrder);

    expect(tx.order.create).toHaveBeenCalledWith({
      data: {
        userId: 7,
        idempotencyKey: 'create-order-test',
        requestHash: expect.any(String),
        status: 'PENDING',
        subtotal: 40000,
        discountTotal: 0,
        pointsRedeemed: 0,
        total: 40000,
        couponCode: null,
        items: {
          create: [
            {
              productId: 1,
              size: 'M',
              toppings: ['Trân châu'],
              qty: 1,
              unitPrice: 40000,
              lineTotal: 40000,
            },
          ],
        },
      },
      select: {
        id: true,
        status: true,
        subtotal: true,
        discountTotal: true,
        pointsRedeemed: true,
        total: true,
      },
    });

    expect(stock.reserve).toHaveBeenCalledWith(
      tx,
      [
        {
          productId: 1,
          size: 'M',
          toppings: ['Trân châu'],
          qty: 1,
        },
      ],
      [product],
    );
  });

  it('trả về đơn hàng cũ khi cùng idempotency key và payload', async () => {
    const payload: CreateOrderDto = {
      items: [
        {
          productId: 1,
          size: 'M',
          toppings: ['Trân châu'],
          qty: 1,
        },
      ],
    };

    const normalizedPayload = {
      items: [
        {
          productId: 1,
          size: 'M',
          toppings: ['Trân châu'],
          qty: 1,
        },
      ],
      couponCode: null,
      pointsToRedeem: 0,
    };

    const requestHash = createHash('sha256')
      .update(JSON.stringify(normalizedPayload))
      .digest('hex');

    const existingOrder = {
      id: 10,
      status: 'PENDING',
      subtotal: 40000,
      discountTotal: 0,
      pointsRedeemed: 0,
      total: 40000,
    };

    prisma.order.findFirst.mockResolvedValue({
      ...existingOrder,
      requestHash,
    });

    const result = await service.create(7, payload, 'duplicate-order-test');

    expect(result).toEqual(existingOrder);
    expect(prisma.order.findFirst).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(stock.reserve).not.toHaveBeenCalled();
  });

  it('báo ConflictException khi cùng key nhưng payload khác', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 10,
      status: 'PENDING',
      subtotal: 40000,
      discountTotal: 0,
      pointsRedeemed: 0,
      total: 40000,
      requestHash: 'different-payload-hash',
    });

    await expect(
      service.create(
        7,
        {
          items: [
            {
              productId: 1,
              size: 'M',
              toppings: ['Trân châu'],
              qty: 1,
            },
          ],
        },
        'duplicate-order-test',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(stock.reserve).not.toHaveBeenCalled();
  });

  it('hủy đơn PENDING và hoàn kho trong transaction', async () => {
    const tx = {
      order: {
        findFirst: vi.fn().mockResolvedValue({
          id: 10,
          status: 'PENDING',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      orderItem: {
        findMany: vi.fn().mockResolvedValue([{ productId: 1, qty: 2 }]),
      },
    };

    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) => callback(tx),
    );

    stock.release.mockResolvedValue(undefined);

    await expect(service.cancel(7, 10)).resolves.toEqual({
      id: 10,
      status: 'CANCELLED',
    });

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 10, userId: 7, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    expect(stock.release).toHaveBeenCalledWith(tx, [{ productId: 1, qty: 2 }]);
  });

  it('báo ORDER_NOT_FOUND nếu đơn không thuộc user hoặc không tồn tại', async () => {
    const tx = {
      order: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn(),
      },
      orderItem: {
        findMany: vi.fn(),
      },
    };

    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) => callback(tx),
    );

    await expect(service.cancel(7, 10)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(stock.release).not.toHaveBeenCalled();
  });

  it('không hủy đơn đã thanh toán', async () => {
    const tx = {
      order: {
        findFirst: vi.fn().mockResolvedValue({
          id: 10,
          status: 'PAID',
        }),
        updateMany: vi.fn(),
      },
      orderItem: {
        findMany: vi.fn(),
      },
    };

    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) => callback(tx),
    );

    await expect(service.cancel(7, 10)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(stock.release).not.toHaveBeenCalled();
  });

  it('hủy đơn PAYMENT_FAILED và hoàn kho', async () => {
    const tx = {
      order: {
        findFirst: vi.fn().mockResolvedValue({
          id: 10,
          status: 'PAYMENT_FAILED',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      orderItem: {
        findMany: vi.fn().mockResolvedValue([{ productId: 1, qty: 2 }]),
      },
    };

    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) => callback(tx),
    );

    stock.release.mockResolvedValue(undefined);

    await expect(service.cancel(7, 10)).resolves.toEqual({
      id: 10,
      status: 'CANCELLED',
    });

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 10,
        userId: 7,
        status: 'PAYMENT_FAILED',
      },
      data: { status: 'CANCELLED' },
    });

    expect(stock.release).toHaveBeenCalledWith(tx, [{ productId: 1, qty: 2 }]);
  });
});

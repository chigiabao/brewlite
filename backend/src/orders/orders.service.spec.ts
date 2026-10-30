import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersService } from './orders.service.js';
import { StockService } from './stock.service.js';
import type { RewardsPort } from '../rewards/public.js';
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

  describe('findOne', () => {
    it('trả về chi tiết đơn hàng khi thuộc đúng user', async () => {
      const mockOrder = {
        id: 10,
        userId: 7,
        status: 'PAID',
        total: 50000,
        items: [],
        payments: [],
      };

      prisma.order.findFirst.mockResolvedValue(mockOrder);

      const result = await service.findOne(7, 10);
      expect(result).toEqual(mockOrder);
      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10, userId: 7 },
        }),
      );
    });

    it('báo lỗi NotFoundException khi không tìm thấy đơn hàng hoặc khác user', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.findOne(7, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});



// ─── FIX 03: kiểm tra wiring E ↔ G (không thể chỉ test Rewards cô lập) ──

describe('FIX03 Orders: quote snapshot và hoàn reservation', () => {
  const prisma = {
    $transaction: vi.fn(),
    order: { findFirst: vi.fn() },
  };
  const stock = { reserve: vi.fn(), release: vi.fn() };
  const rewards = {
    reserveCouponAndPoints: vi.fn(),
    createRedeemEntry: vi.fn(),
    releaseReservedOnCancel: vi.fn(),
    finalizeRewardsOnPaid: vi.fn(),
  };
  let service: OrdersService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new OrdersService(prisma as never, stock as never, rewards as unknown as RewardsPort);
    prisma.order.findFirst.mockResolvedValue(null);
    stock.reserve.mockResolvedValue(undefined);
    stock.release.mockResolvedValue(undefined);
    rewards.createRedeemEntry.mockResolvedValue(undefined);
    rewards.releaseReservedOnCancel.mockResolvedValue(undefined);
  });

  it('tạo đơn lưu pointsRedeemed theo quote thực, không theo số user yêu cầu', async () => {
    const orderCreated = { id: 42, status: 'PENDING', subtotal: 57_000, discountTotal: 57_000, pointsRedeemed: 27_000, total: 0 };
    const tx = {
      order: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(orderCreated) },
      product: { findMany: vi.fn().mockResolvedValue([{
        id: 1, price: 57_000, stock: 8, version: 0,
      }]) },
    };
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx));
    rewards.reserveCouponAndPoints.mockResolvedValue({
      couponDiscount: 30_000, pointsDiscount: 27_000, totalDiscount: 57_000, total: 0,
    });

    const result = await service.create(7, {
      items: [{ productId: 1, size: 'S', toppings: [], qty: 1 }],
      couponCode: '  giAm10  ', pointsToRedeem: 30_000,
    }, 'fix03-capped');
    expect(result).toEqual(orderCreated);
    expect(rewards.reserveCouponAndPoints).toHaveBeenCalledWith({
      userId: 7, subtotal: 57_000, couponCode: 'GIAM10', pointsToRedeem: 30_000,
    }, tx);
    expect(tx.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        pointsRedeemed: 27_000, couponCode: 'GIAM10', discountTotal: 57_000,
      }),
    }));
    expect(rewards.createRedeemEntry).toHaveBeenCalledWith({
      orderId: 42, userId: 7, points: 27_000,
    }, tx);
  });

  it('hủy PENDING: chuyển trạng thái bằng CAS, hoàn stock và reserve G trong cùng tx', async () => {
    const tx = {
      order: {
        findFirst: vi.fn().mockResolvedValue({ id: 42, status: 'PENDING', couponCode: 'GIAM10', pointsRedeemed: 27_000 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      orderItem: { findMany: vi.fn().mockResolvedValue([{ productId: 1, qty: 2 }]) },
    };
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx));
    await expect(service.cancel(7, 42)).resolves.toEqual({ id: 42, status: 'CANCELLED' });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 42, userId: 7, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    expect(stock.release).toHaveBeenCalledWith(tx, [{ productId: 1, qty: 2 }]);
    expect(rewards.releaseReservedOnCancel).toHaveBeenCalledTimes(1);
    expect(rewards.releaseReservedOnCancel).toHaveBeenCalledWith({
      orderId: 42, userId: 7, couponCode: 'GIAM10', pointsRedeemed: 27_000,
    }, tx);
  });

  it('hủy PAYMENT_FAILED: hoàn lại reservation', async () => {
    const tx = {
      order: { findFirst: vi.fn().mockResolvedValue({ id: 42, status: 'PAYMENT_FAILED', couponCode: null, pointsRedeemed: 10_000 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      orderItem: { findMany: vi.fn().mockResolvedValue([]) },
    };
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx));
    await service.cancel(7, 42);
    expect(rewards.releaseReservedOnCancel).toHaveBeenCalledWith({
      orderId: 42, userId: 7, couponCode: null, pointsRedeemed: 10_000,
    }, tx);
  });

  it('race hai cancel: CAS thua => không release stock, quota, points', async () => {
    const tx = {
      order: { findFirst: vi.fn().mockResolvedValue({ id: 42, status: 'PENDING', couponCode: 'GIAM10', pointsRedeemed: 10_000 }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      orderItem: { findMany: vi.fn() },
    };
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx));
    await expect(service.cancel(7, 42)).rejects.toBeInstanceOf(ConflictException);
    expect(stock.release).not.toHaveBeenCalled();
    expect(rewards.releaseReservedOnCancel).not.toHaveBeenCalled();
  });

  it('G báo lỗi => lỗi nổi lên ngoài transaction, không được trả CANCELLED giả', async () => {
    const tx = {
      order: { findFirst: vi.fn().mockResolvedValue({ id: 42, status: 'PENDING', couponCode: 'GIAM10', pointsRedeemed: 10_000 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      orderItem: { findMany: vi.fn().mockResolvedValue([{ productId: 1, qty: 2 }]) },
    };
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx));
    rewards.releaseReservedOnCancel.mockRejectedValue(new Error('COUPON_RELEASE_FAILED'));
    await expect(service.cancel(7, 42)).rejects.toThrow('COUPON_RELEASE_FAILED');
    expect(stock.release).toHaveBeenCalledOnce();
  });

  it('không thể hủy đơn đã PAID để nhận lại điểm (không có chính sách refund)', async () => {
    const tx = {
      order: { findFirst: vi.fn().mockResolvedValue({ id: 42, status: 'PAID', couponCode: 'GIAM10', pointsRedeemed: 10_000 }),
        updateMany: vi.fn() },
      orderItem: { findMany: vi.fn() },
    };
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx));
    await expect(service.cancel(7, 42)).rejects.toBeInstanceOf(ConflictException);
    expect(rewards.releaseReservedOnCancel).not.toHaveBeenCalled();
  });
});

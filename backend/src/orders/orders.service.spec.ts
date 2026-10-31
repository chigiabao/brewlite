import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RewardsPort, RewardsTx } from '../rewards/public.js';
import { OrdersService } from './orders.service.js';

function setup() {
  const tx = {
    product: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    order: {
      create: vi.fn(),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    order: { findMany: vi.fn() },
  };
  const rewards: RewardsPort = {
    reserveCouponAndPoints: vi.fn(),
    createRedeemEntry: vi.fn(),
    releaseOnCancel: vi.fn(),
    finalizeRewardsOnPaid: vi.fn(),
  };
  return {
    tx,
    prisma,
    rewards,
    service: new OrdersService(
      prisma as unknown as PrismaService,
      rewards,
    ),
  };
}

describe('OrdersService – coupon + loyalty checkout integration', () => {
  it('tính giá từ Product, reserve rewards và lưu snapshot vào Order', async () => {
    const { service, tx, rewards } = setup();
    tx.product.findUnique.mockResolvedValue({ id: 7, price: 100_000 });
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    rewards.reserveCouponAndPoints = vi.fn().mockResolvedValue({
      couponDiscount: 10_000,
      pointsDiscount: 5_000,
      totalDiscount: 15_000,
      total: 85_000,
    });
    tx.order.create.mockResolvedValue({
      id: 42,
      status: OrderStatus.PENDING,
      subtotal: 100_000,
      discountTotal: 15_000,
      pointsRedeemed: 5_000,
      total: 85_000,
    });

    const result = await service.create(1, {
      items: [{ productId: 7, size: 'S', toppings: [], qty: 1 }],
      couponCode: ' gIaM10 ',
      pointsToRedeem: 5_000,
    });

    expect(result).toEqual({
      id: 42,
      status: OrderStatus.PENDING,
      subtotal: 100_000,
      discountTotal: 15_000,
      pointsRedeemed: 5_000,
      total: 85_000,
    });
    expect(rewards.reserveCouponAndPoints).toHaveBeenCalledWith(
      { userId: 1, subtotal: 100_000, couponCode: ' gIaM10 ', pointsToRedeem: 5_000 },
      tx as unknown as RewardsTx,
    );
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 7, stock: { gte: 1 } },
      data: { stock: { decrement: 1 }, version: { increment: 1 } },
    });
    expect(tx.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        subtotal: 100_000,
        discountTotal: 15_000,
        pointsRedeemed: 5_000,
        total: 85_000,
        couponCode: 'GIAM10',
      }),
    }));
    expect(rewards.createRedeemEntry).not.toHaveBeenCalled(); // PENDING chưa ghi REDEEM
  });

  it('không tìm thấy Product thì không reserve coupon/points', async () => {
    const { service, tx, rewards } = setup();
    tx.product.findUnique.mockResolvedValue(null);

    await expect(service.create(1, {
      items: [{ productId: 999, size: 'S', toppings: [], qty: 1 }],
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(rewards.reserveCouponAndPoints).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('stock race làm fail transaction trước khi tạo Order', async () => {
    const { service, tx, rewards } = setup();
    tx.product.findUnique.mockResolvedValue({ id: 7, price: 100_000 });
    tx.product.updateMany.mockResolvedValue({ count: 0 });
    rewards.reserveCouponAndPoints = vi.fn().mockResolvedValue({
      couponDiscount: 0,
      pointsDiscount: 0,
      totalDiscount: 0,
      total: 100_000,
    });

    await expect(service.create(1, {
      items: [{ productId: 7, size: 'S', toppings: [], qty: 1 }],
    })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.order.create).not.toHaveBeenCalled();
    expect(rewards.createRedeemEntry).not.toHaveBeenCalled();
  });
});

describe('G-04: fulfillment CAS và trạng thái', () => {
  it('PAID → PREPARING qua compare-and-swap', async () => {
    const tx = { order: {
      findUnique: vi.fn().mockResolvedValue({ status: OrderStatus.PAID }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    } };
    const prisma = { $transaction: vi.fn(async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx)) };
    const service = new OrdersService(prisma as unknown as PrismaService, {} as RewardsPort);
    expect(await service.advanceFulfillment(7, OrderStatus.PREPARING)).toBe(OrderStatus.PREPARING);
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 7, status: OrderStatus.PAID },
      data: { status: OrderStatus.PREPARING },
    });
  });

  it('một yêu cầu thua CAS không được ghi đè trạng thái mới', async () => {
    const tx = { order: {
      findUnique: vi.fn().mockResolvedValue({ status: OrderStatus.PAID }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    } };
    const prisma = { $transaction: vi.fn(async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx)) };
    const service = new OrdersService(prisma as unknown as PrismaService, {} as RewardsPort);
    await expect(service.advanceFulfillment(7, OrderStatus.PREPARING))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(service.advanceFulfillment(7, OrderStatus.COMPLETED)).rejects.toThrow();
  });
});

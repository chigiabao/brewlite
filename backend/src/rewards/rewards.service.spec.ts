import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoyaltyKind } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RewardsService } from './rewards.service.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

const makeCoupon = (overrides: Record<string, unknown> = {}) => ({
  code: 'GIAM10',
  discountPercent: 10,
  discountAmount: null,
  minOrderValue: 50_000,
  maxUses: 10,
  usedCount: 0,
  expiresAt: new Date('2099-12-31T00:00:00Z'),
  active: true,
  ...overrides,
});

const makeTx = (overrides: Partial<ReturnType<typeof makeBaseTx>> = {}) => ({
  ...makeBaseTx(),
  ...overrides,
});

function makeBaseTx() {
  return {
    order: {
      findUnique: vi.fn().mockResolvedValue({ userId: 1, status: 'PAID', total: 85_000 }),
    },
    coupon: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    loyaltyEntry: {
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

// ─── Suite 1: validateCoupon + getBalance (Sprint 1 regression) ───────────

describe('RewardsService: preview và balance', () => {
  const couponMock = { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() };
  const userMock = { findUnique: vi.fn() };
  const prisma = { coupon: couponMock, user: userMock } as unknown as PrismaService;
  const service = new RewardsService(prisma);

  beforeEach(() => {
    vi.clearAllMocks();
    couponMock.findUnique.mockResolvedValue(makeCoupon());
    userMock.findUnique.mockResolvedValue({ loyaltyPoints: 5_000 });
  });

  it('normalize trước DB, 2 lần validate không làm usedCount tăng', async () => {
    const input = { code: '  gIaM10 ', orderTotal: 100_000 };
    expect(await service.validateCoupon(input)).toEqual({ valid: true, discount: 10_000 });
    expect(await service.validateCoupon(input)).toEqual({ valid: true, discount: 10_000 });
    expect(couponMock.findUnique).toHaveBeenCalledWith({ where: { code: 'GIAM10' } });
    expect(couponMock.update).not.toHaveBeenCalled();
    expect(couponMock.updateMany).not.toHaveBeenCalled();
  });

  it('coupon không tồn tại trả 404', async () => {
    couponMock.findUnique.mockResolvedValue(null);
    await expect(service.validateCoupon({ code: 'NONE', orderTotal: 100_000 }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['inactive', { active: false }],
    ['expired', { expiresAt: new Date('2000-01-01') }],
    ['min spend', { minOrderValue: 110_000 }],
    ['quota', { usedCount: 10 }],
  ])('%s trả 400', async (_label, override) => {
    couponMock.findUnique.mockResolvedValue({ ...makeCoupon(), ...override });
    await expect(service.validateCoupon({ code: 'GIAM10', orderTotal: 100_000 }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(couponMock.updateMany).not.toHaveBeenCalled();
  });

  it('DB cấu hình coupon lỗi phải fail-closed', async () => {
    couponMock.findUnique.mockResolvedValue({ ...makeCoupon(), discountAmount: 3_000 });
    await expect(service.validateCoupon({ code: 'GIAM10', orderTotal: 100_000 }))
      .rejects.toThrow('phải có đúng một loại discount');
  });

  it('getBalance chỉ truy vấn user qua id, không làm thay đổi điểm', async () => {
    expect(await service.getBalance(7)).toEqual({ loyaltyPoints: 5_000 });
    expect(userMock.findUnique).toHaveBeenCalledWith({
      where: { id: 7 }, select: { loyaltyPoints: true },
    });
  });

  it('getBalance reject user không tồn tại và id sai', async () => {
    userMock.findUnique.mockResolvedValue(null);
    await expect(service.getBalance(7)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getBalance(0)).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── Suite 2: reserveCouponAndPoints (G-02) ───────────────────────────────

describe('RewardsService.reserveCouponAndPoints', () => {
  const prisma = {} as unknown as PrismaService;
  const service = new RewardsService(prisma);

  it('không coupon, không points → trả full subtotal', async () => {
    const tx = makeTx() as unknown as Parameters<typeof service.reserveCouponAndPoints>[1];
    const result = await service.reserveCouponAndPoints(
      { userId: 1, subtotal: 100_000 },
      tx,
    );
    expect(result).toEqual({
      couponDiscount: 0,
      pointsDiscount: 0,
      totalDiscount: 0,
      total: 100_000,
    });
  });

  it('coupon hợp lệ → reserve thành công, increment usedCount', async () => {
    const tx = makeTx() as unknown as Parameters<typeof service.reserveCouponAndPoints>[1];
    const txMock = tx as unknown as ReturnType<typeof makeBaseTx>;
    txMock.coupon.findUnique.mockResolvedValue(makeCoupon());
    txMock.coupon.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.reserveCouponAndPoints(
      { userId: 1, subtotal: 100_000, couponCode: 'GIAM10' },
      tx,
    );
    expect(result.couponDiscount).toBe(10_000);
    expect(result.total).toBe(90_000);
    expect(txMock.coupon.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { usedCount: { increment: 1 } } }),
    );
  });

  it('race condition quota → updateMany count=0 → ConflictException 409', async () => {
    const tx = makeTx() as unknown as Parameters<typeof service.reserveCouponAndPoints>[1];
    const txMock = tx as unknown as ReturnType<typeof makeBaseTx>;
    txMock.coupon.findUnique.mockResolvedValue(makeCoupon({ usedCount: 9, maxUses: 10 }));
    // Simula race: count=0 vì concurrent request đã chiếm suất cuối
    txMock.coupon.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.reserveCouponAndPoints(
        { userId: 1, subtotal: 100_000, couponCode: 'GIAM10' },
        tx,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('coupon không tồn tại → 404', async () => {
    const tx = makeTx() as unknown as Parameters<typeof service.reserveCouponAndPoints>[1];
    const txMock = tx as unknown as ReturnType<typeof makeBaseTx>;
    txMock.coupon.findUnique.mockResolvedValue(null);

    await expect(
      service.reserveCouponAndPoints(
        { userId: 1, subtotal: 100_000, couponCode: 'NONE' },
        tx,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['inactive', { active: false }],
    ['expired', { expiresAt: new Date('2000-01-01') }],
    ['min_order', { minOrderValue: 200_000 }],
    ['quota_static', { usedCount: 10, maxUses: 10 }],
  ])('coupon %s → 400, không updateMany', async (_label, override) => {
    const tx = makeTx() as unknown as Parameters<typeof service.reserveCouponAndPoints>[1];
    const txMock = tx as unknown as ReturnType<typeof makeBaseTx>;
    txMock.coupon.findUnique.mockResolvedValue(makeCoupon(override));

    await expect(
      service.reserveCouponAndPoints(
        { userId: 1, subtotal: 100_000, couponCode: 'GIAM10' },
        tx,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(txMock.coupon.updateMany).not.toHaveBeenCalled();
  });

  it('pointsToRedeem > 0, đủ điểm → trừ user.loyaltyPoints atomically', async () => {
    const tx = makeTx() as unknown as Parameters<typeof service.reserveCouponAndPoints>[1];
    const txMock = tx as unknown as ReturnType<typeof makeBaseTx>;
    txMock.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.reserveCouponAndPoints(
      { userId: 1, subtotal: 100_000, pointsToRedeem: 5_000 },
      tx,
    );
    expect(result.pointsDiscount).toBe(5_000);
    expect(result.total).toBe(95_000);
    expect(txMock.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, loyaltyPoints: { gte: 5_000 } },
        data: { loyaltyPoints: { decrement: 5_000 } },
      }),
    );
  });

  it('pointsToRedeem > số hiện có → 400 (atomically checked)', async () => {
    const tx = makeTx() as unknown as Parameters<typeof service.reserveCouponAndPoints>[1];
    const txMock = tx as unknown as ReturnType<typeof makeBaseTx>;
    // count=0 nghĩa là user không đủ điểm hoặc race condition
    txMock.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.reserveCouponAndPoints(
        { userId: 1, subtotal: 100_000, pointsToRedeem: 99_999 },
        tx,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('points yêu cầu vượt phần tiền còn lại → chỉ reserve phần được cap', async () => {
    const tx = makeTx() as unknown as Parameters<typeof service.reserveCouponAndPoints>[1];
    const txMock = tx as unknown as ReturnType<typeof makeBaseTx>;
    txMock.coupon.findUnique.mockResolvedValue(makeCoupon());
    txMock.coupon.updateMany.mockResolvedValue({ count: 1 });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.reserveCouponAndPoints(
      { userId: 1, subtotal: 100_000, couponCode: 'GIAM10', pointsToRedeem: 100_000 },
      tx,
    );

    expect(result.pointsDiscount).toBe(90_000);
    expect(txMock.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1, loyaltyPoints: { gte: 90_000 } },
      data: { loyaltyPoints: { decrement: 90_000 } },
    }));
  });

  it('coupon + points cùng lúc → tính đúng thứ tự subtotal → coupon → points', async () => {
    const tx = makeTx() as unknown as Parameters<typeof service.reserveCouponAndPoints>[1];
    const txMock = tx as unknown as ReturnType<typeof makeBaseTx>;
    txMock.coupon.findUnique.mockResolvedValue(makeCoupon()); // 10% off
    txMock.coupon.updateMany.mockResolvedValue({ count: 1 });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.reserveCouponAndPoints(
      { userId: 1, subtotal: 100_000, couponCode: 'GIAM10', pointsToRedeem: 5_000 },
      tx,
    );
    // couponDiscount=10000, remaining=90000, pointsDiscount=5000, total=85000
    expect(result).toEqual({
      couponDiscount: 10_000,
      pointsDiscount: 5_000,
      totalDiscount: 15_000,
      total: 85_000,
    });
  });
});

// ─── Suite 3: finalizeRewardsOnPaid (G-02) ────────────────────────────────

describe('RewardsService.finalizeRewardsOnPaid', () => {
  const prisma = {} as unknown as PrismaService;
  const service = new RewardsService(prisma);

  it('PAID lần đầu → tạo LoyaltyEntry EARN + increment loyaltyPoints', async () => {
    const tx = makeTx() as unknown as Parameters<typeof service.finalizeRewardsOnPaid>[1];
    const txMock = tx as unknown as ReturnType<typeof makeBaseTx>;
    txMock.loyaltyEntry.findUnique.mockResolvedValue(null);
    txMock.loyaltyEntry.create.mockResolvedValue({ id: 1 });
    txMock.user.update.mockResolvedValue({});

    // totalPaid=85000 → floor(85000/100)=850 points
    const result = await service.finalizeRewardsOnPaid(
      { orderId: 10, userId: 1, totalPaid: 85_000 },
      tx,
    );
    expect(result).toEqual({ pointsEarned: 850 });

    expect(txMock.loyaltyEntry.createMany).toHaveBeenCalledWith({
      data: [{
        userId: 1,
        orderId: 10,
        kind: LoyaltyKind.EARN,
        points: 850,
      }],
      skipDuplicates: true,
    });
    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { loyaltyPoints: { increment: 850 } },
    });
  });

  it('exactly-once: entry EARN đã tồn tại → skip, không cộng thêm điểm', async () => {
    const tx = makeTx() as unknown as Parameters<typeof service.finalizeRewardsOnPaid>[1];
    const txMock = tx as unknown as ReturnType<typeof makeBaseTx>;
    // Simula idempotency replay: entry đã có
    txMock.loyaltyEntry.findUnique.mockResolvedValue({ id: 5, points: 850 });
    txMock.loyaltyEntry.createMany.mockResolvedValue({ count: 0 });

    const result = await service.finalizeRewardsOnPaid(
      { orderId: 10, userId: 1, totalPaid: 85_000 },
      tx,
    );
    expect(result).toEqual({ pointsEarned: 850 });
    expect(txMock.loyaltyEntry.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
    }));
    expect(txMock.user.update).not.toHaveBeenCalled();
  });

  it('totalPaid < 100 → 0 points earned, không tạo entry', async () => {
    const tx = makeTx() as unknown as Parameters<typeof service.finalizeRewardsOnPaid>[1];
    const txMock = tx as unknown as ReturnType<typeof makeBaseTx>;
    txMock.order.findUnique.mockResolvedValue({ userId: 1, status: 'PAID', total: 50 });

    const result = await service.finalizeRewardsOnPaid(
      { orderId: 10, userId: 1, totalPaid: 50 },
      tx,
    );
    expect(result).toEqual({ pointsEarned: 0 });
    expect(txMock.loyaltyEntry.findUnique).not.toHaveBeenCalled();
    expect(txMock.loyaltyEntry.createMany).not.toHaveBeenCalled();
    expect(txMock.user.update).not.toHaveBeenCalled();
  });

  it('totalPaid=0 (order free) → 0 points, không tạo entry', async () => {
    const tx = makeTx() as unknown as Parameters<typeof service.finalizeRewardsOnPaid>[1];
    const txMock = tx as unknown as ReturnType<typeof makeBaseTx>;
    txMock.order.findUnique.mockResolvedValue({ userId: 1, status: 'PAID', total: 0 });

    const result = await service.finalizeRewardsOnPaid(
      { orderId: 10, userId: 1, totalPaid: 0 },
      tx,
    );
    expect(result).toEqual({ pointsEarned: 0 });
    expect(txMock.loyaltyEntry.createMany).not.toHaveBeenCalled();
  });
});

describe('G-04 Rewards quota/replay regression', () => {
  const service = new RewardsService({} as PrismaService);
  const asTx = (tx: ReturnType<typeof makeBaseTx>) =>
    tx as unknown as Parameters<typeof service.reserveCouponAndPoints>[1];

  it('maxUses=0 khóa coupon ngay cả khi chưa có lượt dùng', async () => {
    const tx = makeBaseTx();
    tx.coupon.findUnique.mockResolvedValue(makeCoupon({ maxUses: 0 }));
    await expect(service.reserveCouponAndPoints(
      { userId: 1, subtotal: 100_000, couponCode: 'GIAM10' }, asTx(tx),
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.coupon.updateMany).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('quota null không giới hạn nhưng vẫn kiểm tra active/expiry khi ghi', async () => {
    const tx = makeBaseTx();
    tx.coupon.findUnique.mockResolvedValue(makeCoupon({ maxUses: null, usedCount: 10_000 }));
    tx.coupon.updateMany.mockResolvedValue({ count: 1 });
    await service.reserveCouponAndPoints(
      { userId: 1, subtotal: 100_000, couponCode: ' gIaM10 ' }, asTx(tx),
    );
    expect(tx.coupon.updateMany).toHaveBeenCalledWith({
      where: { code: 'GIAM10', active: true, expiresAt: { gt: expect.any(Date) } },
      data: { usedCount: { increment: 1 } },
    });
  });

  it('mất slot quota cuối không được trừ điểm', async () => {
    const tx = makeBaseTx();
    tx.coupon.findUnique.mockResolvedValue(makeCoupon({ usedCount: 9 }));
    tx.coupon.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.reserveCouponAndPoints(
      { userId: 1, subtotal: 100_000, couponCode: 'GIAM10', pointsToRedeem: 5_000 },
      asTx(tx),
    )).rejects.toBeInstanceOf(ConflictException);
    expect(tx.coupon.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ usedCount: { lt: 10 } }),
    }));
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('coupon giảm toàn bộ subtotal không reserve thêm điểm', async () => {
    const tx = makeBaseTx();
    tx.coupon.findUnique.mockResolvedValue(makeCoupon({ discountPercent: 100 }));
    tx.coupon.updateMany.mockResolvedValue({ count: 1 });
    expect(await service.reserveCouponAndPoints(
      { userId: 1, subtotal: 100_000, couponCode: 'GIAM10', pointsToRedeem: 5_000 },
      asTx(tx),
    )).toMatchObject({ total: 0, pointsDiscount: 0 });
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'points không hợp lệ (%s) bị chặn trước khi giữ quota', async (pointsToRedeem) => {
      const tx = makeBaseTx();
      await expect(service.reserveCouponAndPoints(
        { userId: 1, subtotal: 100_000, couponCode: 'GIAM10', pointsToRedeem }, asTx(tx),
      )).rejects.toThrow('pointsToRedeem');
      expect(tx.coupon.findUnique).not.toHaveBeenCalled();
      expect(tx.coupon.updateMany).not.toHaveBeenCalled();
      expect(tx.user.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each(['PENDING', 'PAYMENT_FAILED', 'CANCELLED'])(
    'finalize đơn %s bị chặn trước khi ghi EARN', async (status) => {
      const tx = makeBaseTx();
      tx.order.findUnique.mockResolvedValue({ userId: 1, status, total: 85_000 });
      await expect(service.finalizeRewardsOnPaid(
        { orderId: 10, userId: 1, totalPaid: 85_000 }, asTx(tx),
      )).rejects.toBeInstanceOf(ConflictException);
      expect(tx.loyaltyEntry.createMany).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
    },
  );

  it.each([null, { userId: 2, status: 'PAID', total: 85_000 }])(
    'không finalize đơn không tồn tại hoặc thuộc user khác: %j', async (order) => {
      const tx = makeBaseTx();
      tx.order.findUnique.mockResolvedValue(order);
      await expect(service.finalizeRewardsOnPaid(
        { orderId: 10, userId: 1, totalPaid: 85_000 }, asTx(tx),
      )).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.loyaltyEntry.createMany).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
    },
  );

  it('callback có tổng tiền khác Order snapshot bị chặn', async () => {
    const tx = makeBaseTx();
    await expect(service.finalizeRewardsOnPaid(
      { orderId: 10, userId: 1, totalPaid: 100_000 }, asTx(tx),
    )).rejects.toBeInstanceOf(ConflictException);
    expect(tx.loyaltyEntry.createMany).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('replay REDEEM không trừ balance lần hai', async () => {
    const tx = makeBaseTx();
    tx.loyaltyEntry.createMany.mockResolvedValue({ count: 0 });
    await service.createRedeemEntry({ orderId: 10, userId: 1, points: 5_000 }, asTx(tx));
    expect(tx.loyaltyEntry.createMany).toHaveBeenCalledWith({
      data: [{ orderId: 10, userId: 1, points: 5_000, kind: 'REDEEM' }],
      skipDuplicates: true,
    });
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('ledger write thất bại không được cộng balance', async () => {
    const tx = makeBaseTx();
    tx.loyaltyEntry.createMany.mockRejectedValue(new Error('ledger unavailable'));
    await expect(service.finalizeRewardsOnPaid(
      { orderId: 10, userId: 1, totalPaid: 85_000 }, asTx(tx),
    )).rejects.toThrow('ledger unavailable');
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

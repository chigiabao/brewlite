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
      deleteMany: vi.fn(),
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

// ─── FIX 06: REDEEM + EARN chỉ finalize sau PAID ────────────────────────────

describe('RewardsService.finalizeRewardsOnPaid', () => {
  const service = new RewardsService({} as PrismaService);
  const finalize = (tx: ReturnType<typeof makeBaseTx>, pointsRedeemed: number, totalPaid = 85_000) =>
    service.finalizeRewardsOnPaid(
      { orderId: 10, userId: 1, totalPaid, pointsRedeemed },
      tx as never,
    );

  it('đơn PAID có đổi điểm: ghi REDEEM và EARN đúng số điểm, chỉ cộng EARN vào balance', async () => {
    const tx = makeBaseTx();
    tx.loyaltyEntry.findUnique.mockResolvedValue(null);
    tx.loyaltyEntry.create.mockResolvedValue({ id: 9 });
    tx.user.update.mockResolvedValue({});
    const result = await finalize(tx, 15_000);
    expect(result).toEqual({ pointsEarned: 850 });
    expect(tx.loyaltyEntry.create).toHaveBeenCalledTimes(2);
    expect(tx.loyaltyEntry.create).toHaveBeenCalledWith({
      data: { orderId: 10, userId: 1, kind: LoyaltyKind.REDEEM, points: 15_000 },
    });
    expect(tx.loyaltyEntry.create).toHaveBeenCalledWith({
      data: { orderId: 10, userId: 1, kind: LoyaltyKind.EARN, points: 850 },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 1 }, data: { loyaltyPoints: { increment: 850 } },
    });
    expect(tx.user.updateMany).not.toHaveBeenCalled(); // đã reserve ngay khi tạo đơn
  });

  it('retry/replay: có cả REDEEM và EARN -> không ghi/cộng trùng', async () => {
    const tx = makeBaseTx();
    tx.loyaltyEntry.findUnique.mockImplementation(async ({ where }: any) =>
      where.orderId_kind.kind === LoyaltyKind.REDEEM
        ? { userId: 1, points: 15_000 }
        : { userId: 1, points: 850 });
    expect(await finalize(tx, 15_000)).toEqual({ pointsEarned: 850 });
    expect(tx.loyaltyEntry.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('đơn cũ từ FIX03 đã có REDEEM lúc PENDING -> không ghi trùng khi PAID', async () => {
    const tx = makeBaseTx();
    tx.loyaltyEntry.findUnique.mockImplementation(async ({ where }: any) =>
      where.orderId_kind.kind === LoyaltyKind.REDEEM
        ? { userId: 1, points: 15_000 } : null);
    tx.loyaltyEntry.create.mockResolvedValue({});
    tx.user.update.mockResolvedValue({});
    await finalize(tx, 15_000);
    expect(tx.loyaltyEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.loyaltyEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: LoyaltyKind.EARN }),
    });
  });

  it('REDEEM cũ không khớp snapshot -> fail closed (transaction phải rollback)', async () => {
    const tx = makeBaseTx();
    tx.loyaltyEntry.findUnique.mockResolvedValue({ userId: 1, points: 16_000 });
    await expect(finalize(tx, 15_000)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('totalPaid <100 nhưng có redeem vẫn cần REDEEM entry, không có EARN', async () => {
    const tx = makeBaseTx();
    tx.loyaltyEntry.findUnique.mockResolvedValue(null);
    tx.loyaltyEntry.create.mockResolvedValue({});
    expect(await finalize(tx, 50, 50)).toEqual({ pointsEarned: 0 });
    expect(tx.loyaltyEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.loyaltyEntry.create).toHaveBeenCalledWith({
      data: { userId: 1, orderId: 10, kind: LoyaltyKind.REDEEM, points: 50 },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('totalPaid=0, pointsRedeemed=0 -> không ghi entry nào', async () => {
    const tx = makeBaseTx();
    expect(await finalize(tx, 0, 0)).toEqual({ pointsEarned: 0 });
    expect(tx.loyaltyEntry.create).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, NaN])('reject pointsRedeemed=%s trước mọi ghi DB', async (points) => {
    const tx = makeBaseTx();
    await expect(finalize(tx, points)).rejects.toThrow('pointsRedeemed');
    expect(tx.loyaltyEntry.create).not.toHaveBeenCalled();
  });
});

// ─── FIX 03: redeem đúng số điểm giảm và hoàn khi cancel ──────────────────

describe('FIX03 Rewards: capped redeem và release reservation', () => {
  const service = new RewardsService({} as PrismaService);

  it('coupon giảm 30k từ 57k, yêu cầu 30k điểm: chỉ trừ và lưu 27k', async () => {
    const txMock = makeBaseTx();
    txMock.coupon.findUnique.mockResolvedValue(
      makeCoupon({ discountPercent: null, discountAmount: 30_000 }),
    );
    txMock.coupon.updateMany.mockResolvedValue({ count: 1 });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });

    const quote = await service.reserveCouponAndPoints(
      { userId: 7, subtotal: 57_000, couponCode: 'GIAM10', pointsToRedeem: 30_000 },
      txMock as never,
    );
    expect(quote).toEqual({
      couponDiscount: 30_000, pointsDiscount: 27_000,
      totalDiscount: 57_000, total: 0,
    });
    expect(txMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7, loyaltyPoints: { gte: 27_000 } },
      data: { loyaltyPoints: { decrement: 27_000 } },
    });
  });

  it('coupon giảm hết tiền: không trừ 1 điểm nào dù khách yêu cầu', async () => {
    const txMock = makeBaseTx();
    txMock.coupon.findUnique.mockResolvedValue(
      makeCoupon({ discountPercent: null, discountAmount: 100_000 }),
    );
    txMock.coupon.updateMany.mockResolvedValue({ count: 1 });
    const quote = await service.reserveCouponAndPoints(
      { userId: 7, subtotal: 57_000, couponCode: 'GIAM10', pointsToRedeem: 30_000 },
      txMock as never,
    );
    expect(quote.pointsDiscount).toBe(0);
    expect(quote.total).toBe(0);
    expect(txMock.user.updateMany).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, NaN, Infinity])('reject pointsToRedeem=%s trước mọi DB update', async (requested) => {
    const txMock = makeBaseTx();
    await expect(service.reserveCouponAndPoints(
      { userId: 7, subtotal: 57_000, couponCode: 'GIAM10', pointsToRedeem: requested },
      txMock as never,
    )).rejects.toThrow('pointsToRedeem');
    expect(txMock.coupon.updateMany).not.toHaveBeenCalled();
    expect(txMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('cancel hoàn quota + điểm đúng giá trị đã dùng trong cùng transaction', async () => {
    const txMock = makeBaseTx();
    txMock.coupon.updateMany.mockResolvedValue({ count: 1 });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });
    await service.releaseReservedOnCancel(
      { orderId: 4, userId: 7, couponCode: ' giAm10 ', pointsRedeemed: 27_000 },
      txMock as never,
    );
    expect(txMock.coupon.updateMany).toHaveBeenCalledWith({
      where: { code: 'GIAM10', usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
    expect(txMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { loyaltyPoints: { increment: 27_000 } },
    });
    expect(txMock.loyaltyEntry.deleteMany).toHaveBeenCalledWith({
      where: { orderId: 4, kind: LoyaltyKind.REDEEM },
    });
  });

  it('chỉ dùng points: không đụng coupon', async () => {
    const txMock = makeBaseTx();
    txMock.user.updateMany.mockResolvedValue({ count: 1 });
    await service.releaseReservedOnCancel(
      { orderId: 4, userId: 7, couponCode: null, pointsRedeemed: 5_000 },
      txMock as never,
    );
    expect(txMock.coupon.updateMany).not.toHaveBeenCalled();
  });

  it('quota đã bằng 0 => 409; không hoàn điểm một cách đơn lẻ', async () => {
    const txMock = makeBaseTx();
    txMock.coupon.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.releaseReservedOnCancel(
      { orderId: 4, userId: 7, couponCode: 'GIAM10', pointsRedeemed: 5_000 },
      txMock as never,
    )).rejects.toBeInstanceOf(ConflictException);
    expect(txMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('user bị xóa => 409 để transaction cancel rollback', async () => {
    const txMock = makeBaseTx();
    txMock.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.releaseReservedOnCancel(
      { orderId: 4, userId: 7, couponCode: null, pointsRedeemed: 5_000 },
      txMock as never,
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancel không có reservation: không thay đổi quota/balance', async () => {
    const txMock = makeBaseTx();
    await service.releaseReservedOnCancel(
      { orderId: 4, userId: 7, couponCode: null, pointsRedeemed: 0 },
      txMock as never,
    );
    expect(txMock.coupon.updateMany).not.toHaveBeenCalled();
    expect(txMock.user.updateMany).not.toHaveBeenCalled();
  });
});

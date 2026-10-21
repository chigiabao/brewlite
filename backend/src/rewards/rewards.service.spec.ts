import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RewardsService } from './rewards.service.js';

const makeCoupon = () => ({
  code: 'GIAM10', discountPercent: 10, discountAmount: null,
  minOrderValue: 50_000, maxUses: 10, usedCount: 0,
  expiresAt: new Date('2099-12-31T00:00:00Z'), active: true,
});

describe('RewardsService: preview và balance', () => {
  const coupon = { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() };
  const user = { findUnique: vi.fn() };
  const prisma = { coupon, user } as unknown as PrismaService;
  const service = new RewardsService(prisma);

  beforeEach(() => {
    vi.clearAllMocks();
    coupon.findUnique.mockResolvedValue(makeCoupon());
    user.findUnique.mockResolvedValue({ loyaltyPoints: 5_000 });
  });

  it('normalize trước DB, 2 lần validate không làm usedCount tăng', async () => {
    const input = { code: '  gIaM10 ', orderTotal: 100_000 };
    expect(await service.validateCoupon(input)).toEqual({ valid: true, discount: 10_000 });
    expect(await service.validateCoupon(input)).toEqual({ valid: true, discount: 10_000 });
    expect(coupon.findUnique).toHaveBeenCalledWith({ where: { code: 'GIAM10' } });
    expect(coupon.update).not.toHaveBeenCalled();
    expect(coupon.updateMany).not.toHaveBeenCalled();
  });

  it('coupon không tồn tại trả 404', async () => {
    coupon.findUnique.mockResolvedValue(null);
    await expect(service.validateCoupon({ code: 'NONE', orderTotal: 100_000 }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['inactive', { active: false }],
    ['expired', { expiresAt: new Date('2000-01-01') }],
    ['min spend', { minOrderValue: 110_000 }],
    ['quota', { usedCount: 10 }],
  ])('%s trả 400', async (_label, override) => {
    coupon.findUnique.mockResolvedValue({ ...makeCoupon(), ...override });
    await expect(service.validateCoupon({ code: 'GIAM10', orderTotal: 100_000 }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(coupon.updateMany).not.toHaveBeenCalled();
  });

  it('DB cấu hình coupon lỗi phải fail-closed', async () => {
    coupon.findUnique.mockResolvedValue({ ...makeCoupon(), discountAmount: 3_000 });
    await expect(service.validateCoupon({ code: 'GIAM10', orderTotal: 100_000 }))
      .rejects.toThrow('phải có đúng một loại discount');
  });

  it('getBalance chỉ truy vấn user qua id, không làm thay đổi điểm', async () => {
    expect(await service.getBalance(7)).toEqual({ loyaltyPoints: 5_000 });
    expect(user.findUnique).toHaveBeenCalledWith({
      where: { id: 7 }, select: { loyaltyPoints: true },
    });
  });

  it('getBalance reject user không tồn tại và id sai', async () => {
    user.findUnique.mockResolvedValue(null);
    await expect(service.getBalance(7)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getBalance(0)).rejects.toBeInstanceOf(BadRequestException);
  });
});

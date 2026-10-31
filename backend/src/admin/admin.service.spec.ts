import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminService } from './admin.service.js';
import { OrderStatus } from '../generated/prisma/enums.js';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('AdminService', () => {
  let service: AdminService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      order: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      product: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      orderItem: {
        findMany: vi.fn(),
        groupBy: vi.fn(),
      },
      user: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      coupon: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      payment: {
        updateMany: vi.fn(),
      },
      loyaltyEntry: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn((callback) => callback(mockPrisma)),
    };

    service = new AdminService(mockPrisma);
  });

  it('calculates dashboard stats correctly', async () => {
    mockPrisma.order.findMany
      .mockResolvedValueOnce([
        { id: 1, status: OrderStatus.PAID, total: 50000, createdAt: new Date() },
        { id: 2, status: OrderStatus.COMPLETED, total: 45000, createdAt: new Date() },
        { id: 3, status: OrderStatus.CANCELLED, total: 30000, createdAt: new Date() },
      ])
      .mockResolvedValueOnce([]); // recentOrders

    mockPrisma.product.count
      .mockResolvedValueOnce(6) // total
      .mockResolvedValueOnce(1); // lowStock

    mockPrisma.user.findMany.mockResolvedValueOnce([
      { id: 1, loyaltyPoints: 50 },
      { id: 2, loyaltyPoints: 20 },
    ]);

    mockPrisma.orderItem.findMany.mockResolvedValueOnce([]);

    const stats = await service.getDashboardStats();
    expect(stats.totalRevenue).toBe(95000);
    expect(stats.totalOrders).toBe(3);
    expect(stats.totalProducts).toBe(6);
    expect(stats.lowStockCount).toBe(1);
    expect(stats.totalCustomers).toBe(2);
    expect(stats.totalLoyaltyPoints).toBe(70);
  });

  it('updates order status following state machine', async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: 10,
      status: OrderStatus.PAID,
      items: [],
    });

    mockPrisma.order.update.mockResolvedValueOnce({
      id: 10,
      status: OrderStatus.PREPARING,
    });

    const result = await service.updateOrderStatus(10, OrderStatus.PREPARING);
    expect(result.status).toBe(OrderStatus.PREPARING);
  });

  it('throws NotFoundException when order does not exist', async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce(null);
    await expect(service.updateOrderStatus(999, OrderStatus.PREPARING)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('prevents duplicate coupon creation with ConflictException', async () => {
    mockPrisma.coupon.findUnique.mockResolvedValueOnce({ code: 'GIAM10' });
    await expect(service.createCoupon({ code: 'GIAM10' })).rejects.toThrow(ConflictException);
  });

  it('safely deactivates coupon if it has existing orders', async () => {
    mockPrisma.coupon.findUnique.mockResolvedValueOnce({
      code: 'GIAM10',
      _count: { orders: 5 },
    });
    mockPrisma.coupon.update.mockResolvedValueOnce({ code: 'GIAM10', active: false });

    await service.deleteCoupon('GIAM10');
    expect(mockPrisma.coupon.update).toHaveBeenCalledWith({
      where: { code: 'GIAM10' },
      data: { active: false },
    });
    expect(mockPrisma.coupon.delete).not.toHaveBeenCalled();
  });
});

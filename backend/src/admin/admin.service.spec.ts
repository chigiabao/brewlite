import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminService } from './admin.service.js';
import { OrderStatus } from '../generated/prisma/enums.js';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('AdminService', () => {
  let service: AdminService;
  let mockPrisma: any;
  let mockOrders: any;

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
        updateMany: vi.fn(),
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
        updateMany: vi.fn(),
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

    mockOrders = {
      advancePreparation: vi.fn(),
      cancel: vi.fn(),
    };
    service = new AdminService(mockPrisma, mockOrders);
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

  it('giao bước pha chế cho OrdersService CAS thay vì ghi status trực tiếp', async () => {
    mockOrders.advancePreparation.mockResolvedValueOnce({ id: 10, status: OrderStatus.PREPARING });
    const result = await service.updateOrderStatus(10, OrderStatus.PREPARING);
    expect(result.status).toBe(OrderStatus.PREPARING);
    expect(mockOrders.advancePreparation).toHaveBeenCalledWith(10, OrderStatus.PREPARING);
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });

  it('REFUNDED không được tạo giả khi chưa nhận webhook Stripe', async () => {
    await expect(service.updateOrderStatus(10, OrderStatus.REFUNDED)).rejects.toThrow(
      ConflictException,
    );
    expect(mockOrders.cancel).not.toHaveBeenCalled();
    expect(mockOrders.advancePreparation).not.toHaveBeenCalled();
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
    expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('từ chối admin tự gán PAID vì phải xử lý qua payment', async () => {
    await expect(service.updateOrderStatus(10, OrderStatus.PAID)).rejects.toThrow(
      ConflictException,
    );
  });

  it('hủy PENDING qua transaction hoàn stock/coupon/points của OrdersService', async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({ userId: 5, status: OrderStatus.PENDING });
    mockOrders.cancel.mockResolvedValueOnce({ id: 10, status: OrderStatus.CANCELLED });
    const result = await service.updateOrderStatus(10, OrderStatus.CANCELLED);
    expect(result.status).toBe(OrderStatus.CANCELLED);
    expect(mockOrders.cancel).toHaveBeenCalledWith(5, 10);
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });

  it('chặn hủy PAID để tránh mất dấu hoàn tiền thật', async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({ userId: 5, status: OrderStatus.PAID });
    await expect(service.updateOrderStatus(10, OrderStatus.CANCELLED)).rejects.toThrow(
      ConflictException,
    );
    expect(mockOrders.cancel).not.toHaveBeenCalled();
  });

  it('không tìm thấy đơn cần hủy', async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce(null);
    await expect(service.updateOrderStatus(999, OrderStatus.CANCELLED)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('nhập kho dùng CAS theo version và increment nguyên tử', async () => {
    mockPrisma.product.findUnique
      .mockResolvedValueOnce({ id: 7, stock: 4, version: 3 })
      .mockResolvedValueOnce({ id: 7, stock: 9, version: 4 });
    mockPrisma.product.updateMany.mockResolvedValueOnce({ count: 1 });
    const result = await service.updateStock(7, { delta: 5 });
    expect(result.stock).toBe(9);
    expect(mockPrisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 7, version: 3 },
      data: { stock: { increment: 5 }, version: { increment: 1 } },
    });
  });

  it('không xuất kho âm hoặc âm thầm ép thành 0 khi thiếu hàng', async () => {
    mockPrisma.product.findUnique.mockResolvedValueOnce({ id: 7, stock: 2, version: 3 });
    mockPrisma.product.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.updateStock(7, { delta: -5 })).rejects.toThrow(ConflictException);
    expect(mockPrisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 7, version: 3, stock: { gte: 5 } },
      data: { stock: { increment: -5 }, version: { increment: 1 } },
    });
  });

  it('không cho stock và delta cùng tồn tại, hoặc không có trường nào', async () => {
    await expect(service.updateStock(7, { stock: 3, delta: 5 })).rejects.toThrow();
    await expect(service.updateStock(7, {})).rejects.toThrow();
    expect(mockPrisma.product.updateMany).not.toHaveBeenCalled();
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

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums.js';
import { assertTransition } from '../orders/public.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ================= 1. DASHBOARD & STATS =================
  async getDashboardStats() {
    const revenueStatuses: OrderStatus[] = [
      OrderStatus.PAID,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.COMPLETED,
    ];

    const [
      allOrders,
      totalProducts,
      lowStockProducts,
      totalUsers,
      recentOrders,
      productsWithSales,
    ] = await Promise.all([
      this.prisma.order.findMany({
        select: {
          id: true,
          status: true,
          total: true,
          createdAt: true,
        },
      }),
      this.prisma.product.count(),
      this.prisma.product.count({
        where: { stock: { lt: 20 } },
      }),
      this.prisma.user.findMany({
        select: { id: true, loyaltyPoints: true },
      }),
      this.prisma.order.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, imageUrl: true } },
            },
          },
          payments: {
            select: {
              id: true,
              method: true,
              status: true,
              transactionId: true,
              stripePaymentIntentId: true,
            },
          },
        },
      }),
      this.prisma.orderItem.findMany({
        select: {
          productId: true,
          qty: true,
          lineTotal: true,
          product: { select: { id: true, name: true, imageUrl: true, price: true } },
        },
      }),
    ]);

    // Doanh thu tổng hợp
    const paidOrders = allOrders.filter((o) => revenueStatuses.includes(o.status));
    const totalRevenue = paidOrders.reduce((sum, o) => sum + o.total, 0);

    // Doanh thu hôm nay
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const paidOrdersToday = paidOrders.filter((o) => new Date(o.createdAt) >= today);
    const revenueToday = paidOrdersToday.reduce((sum, o) => sum + o.total, 0);

    // Giá trị đơn trung bình (AOV)
    const averageOrderValue = paidOrders.length > 0 ? Math.round(totalRevenue / paidOrders.length) : 0;

    // Thống kê đơn theo trạng thái (đầy đủ enum bao gồm REFUNDED)
    const ordersByStatus: Record<string, number> = {
      PENDING: 0,
      PAID: 0,
      PREPARING: 0,
      READY: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      REFUNDED: 0,
      PAYMENT_FAILED: 0,
    };
    for (const o of allOrders) {
      if (ordersByStatus[o.status] !== undefined) {
        ordersByStatus[o.status]++;
      }
    }

    // Tổng điểm thưởng tích lũy hệ thống
    const totalLoyaltyPoints = totalUsers.reduce((sum, u) => sum + u.loyaltyPoints, 0);

    // Thống kê doanh thu 7 ngày gần nhất (tính theo giờ địa phương)
    const dailyMap = new Map<
      string,
      { date: string; label: string; revenue: number; orderCount: number }
    >();

    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${month}-${day}`;
      const label = `${dayNames[d.getDay()]} (${day}/${month})`;
      dailyMap.set(key, { date: key, label, revenue: 0, orderCount: 0 });
    }

    for (const o of paidOrders) {
      const d = new Date(o.createdAt);
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${month}-${day}`;
      if (dailyMap.has(key)) {
        const item = dailyMap.get(key)!;
        item.revenue += o.total;
        item.orderCount += 1;
      }
    }
    const revenueChart = Array.from(dailyMap.values());

    // Top sản phẩm bán chạy nhất
    const salesByProduct = new Map<
      number,
      { id: number; name: string; imageUrl: string; price: number; totalSold: number; totalRevenue: number }
    >();

    for (const item of productsWithSales) {
      const pid = item.productId;
      if (!salesByProduct.has(pid) && item.product) {
        salesByProduct.set(pid, {
          id: pid,
          name: item.product.name,
          imageUrl: item.product.imageUrl,
          price: item.product.price,
          totalSold: 0,
          totalRevenue: 0,
        });
      }
      const existing = salesByProduct.get(pid);
      if (existing) {
        existing.totalSold += item.qty;
        existing.totalRevenue += item.lineTotal;
      }
    }

    const topSellingProducts = Array.from(salesByProduct.values())
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, 5);

    return {
      totalRevenue,
      revenueToday,
      ordersTodayCount: paidOrdersToday.length,
      averageOrderValue,
      totalOrders: allOrders.length,
      ordersByStatus,
      totalProducts,
      lowStockCount: lowStockProducts,
      totalCustomers: totalUsers.length,
      totalLoyaltyPoints,
      revenueChart,
      recentOrders,
      topSellingProducts,
    };
  }

  // ================= 2. QUẢN LÝ ĐƠN HÀNG =================
  async getOrders(status?: string, search?: string) {
    const whereClause: Record<string, unknown> = {};

    if (status && status !== 'ALL') {
      whereClause.status = status as OrderStatus;
    }

    if (search && search.trim() !== '') {
      const keyword = search.trim();
      const numId = Number.parseInt(keyword, 10);
      whereClause.OR = [
        ...(!Number.isNaN(numId) ? [{ id: numId }] : []),
        { user: { email: { contains: keyword, mode: 'insensitive' } } },
        { couponCode: { contains: keyword, mode: 'insensitive' } },
        { payments: { some: { transactionId: { contains: keyword, mode: 'insensitive' } } } },
      ];
    }

    return this.prisma.order.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, email: true, loyaltyPoints: true },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, imageUrl: true },
            },
          },
        },
        payments: {
          select: {
            id: true,
            method: true,
            status: true,
            amount: true,
            transactionId: true,
            stripePaymentIntentId: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async updateOrderStatus(orderId: number, targetStatus: OrderStatus) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng #${orderId}`);
    }

    // Kiểm tra tính hợp lệ của luồng chuyển trạng thái theo máy trạng thái
    assertTransition(order.status, targetStatus);

    return this.prisma.$transaction(async (tx) => {
      // 1. Nếu hủy đơn hàng (CANCELLED) hoặc hoàn tiền (REFUNDED)
      if (targetStatus === OrderStatus.CANCELLED || targetStatus === OrderStatus.REFUNDED) {
        // Hoàn trả tồn kho cho từng sản phẩm
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: { increment: item.qty },
              version: { increment: 1 },
            },
          });
        }

        // Cập nhật các giao dịch pending thành FAILED hoặc REFUNDED
        await tx.payment.updateMany({
          where: { orderId, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.FAILED },
        });

        if (targetStatus === OrderStatus.REFUNDED) {
          await tx.payment.updateMany({
            where: { orderId, status: PaymentStatus.SUCCEEDED },
            data: { status: PaymentStatus.REFUNDED },
          });
        }

        // Hoàn lại lượt dùng voucher nếu có
        if (order.couponCode) {
          const coupon = await tx.coupon.findUnique({ where: { code: order.couponCode } });
          if (coupon && coupon.usedCount > 0) {
            await tx.coupon.update({
              where: { code: order.couponCode },
              data: { usedCount: { decrement: 1 } },
            });
          }
        }

        // Hoàn trả điểm thưởng đã dùng cho khách hàng
        if (order.pointsRedeemed > 0) {
          await tx.user.update({
            where: { id: order.userId },
            data: { loyaltyPoints: { increment: order.pointsRedeemed } },
          });
        }

        // Nếu hoàn tiền (REFUNDED), thu hồi lại số điểm đã tích lũy khi mua đơn
        if (targetStatus === OrderStatus.REFUNDED) {
          const earnEntry = await tx.loyaltyEntry.findFirst({
            where: { orderId, kind: 'EARN' },
          });
          if (earnEntry && earnEntry.points > 0) {
            await tx.user.update({
              where: { id: order.userId },
              data: { loyaltyPoints: { decrement: earnEntry.points } },
            });
          }
        }
      }

      return tx.order.update({
        where: { id: orderId },
        data: { status: targetStatus },
        include: {
          user: { select: { id: true, email: true } },
          items: {
            include: { product: { select: { id: true, name: true, imageUrl: true } } },
          },
          payments: true,
        },
      });
    });
  }

  // ================= 3. QUẢN LÝ SẢN PHẨM & KHO HÀNG =================
  async getProducts() {
    const [products, items] = await Promise.all([
      this.prisma.product.findMany({
        orderBy: { id: 'asc' },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        _sum: { qty: true },
      }),
    ]);

    const salesMap = new Map<number, number>();
    for (const item of items) {
      salesMap.set(item.productId, item._sum.qty || 0);
    }

    return products.map((p) => ({
      ...p,
      totalSold: salesMap.get(p.id) || 0,
    }));
  }

  async createProduct(data: { name: string; price: number; imageUrl: string; stock?: number }) {
    if (!data.name?.trim() || typeof data.price !== 'number' || data.price < 0) {
      throw new BadRequestException('Tên và giá sản phẩm không hợp lệ');
    }

    return this.prisma.product.create({
      data: {
        name: data.name.trim(),
        price: Math.round(data.price),
        imageUrl: data.imageUrl?.trim() || '/img/caphesua.jpg',
        stock: typeof data.stock === 'number' && data.stock >= 0 ? Math.round(data.stock) : 100,
      },
    });
  }

  async updateProduct(
    id: number,
    data: { name?: string; price?: number; imageUrl?: string; stock?: number },
  ) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy sản phẩm #${id}`);
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        ...(data.name?.trim() ? { name: data.name.trim() } : {}),
        ...(typeof data.price === 'number' && data.price >= 0 ? { price: Math.round(data.price) } : {}),
        ...(data.imageUrl?.trim() ? { imageUrl: data.imageUrl.trim() } : {}),
        ...(typeof data.stock === 'number' && data.stock >= 0 ? { stock: Math.round(data.stock) } : {}),
        version: { increment: 1 },
      },
    });
  }

  async updateStock(id: number, deltaOrStock: { stock?: number; delta?: number }) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy sản phẩm #${id}`);
    }

    let nextStock = existing.stock;
    if (typeof deltaOrStock.stock === 'number') {
      nextStock = Math.max(0, Math.round(deltaOrStock.stock));
    } else if (typeof deltaOrStock.delta === 'number') {
      nextStock = Math.max(0, existing.stock + Math.round(deltaOrStock.delta));
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        stock: nextStock,
        version: { increment: 1 },
      },
    });
  }

  async deleteProduct(id: number) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { items: { select: { id: true }, take: 1 } },
    });

    if (!existing) {
      throw new NotFoundException(`Không tìm thấy sản phẩm #${id}`);
    }

    // Nếu sản phẩm đã phát sinh đơn hàng trong quá khứ, đặt stock = 0 để giữ tính toàn vẹn dữ liệu
    if (existing.items.length > 0) {
      return this.prisma.product.update({
        where: { id },
        data: { stock: 0 },
      });
    }

    return this.prisma.product.delete({ where: { id } });
  }

  // ================= 4. QUẢN LÝ MÃ KHUYẾN MÃI (COUPONS) =================
  async getCoupons() {
    return this.prisma.coupon.findMany({
      orderBy: { code: 'asc' },
      include: {
        _count: { select: { orders: true } },
      },
    });
  }

  async createCoupon(data: {
    code: string;
    discountPercent?: number;
    discountAmount?: number;
    minOrderValue?: number;
    maxUses?: number;
    expiresAt?: string;
    active?: boolean;
  }) {
    const normalizedCode = data.code?.trim().toUpperCase();
    if (!normalizedCode) {
      throw new BadRequestException('Mã voucher không được để trống');
    }

    // Kiểm tra trùng mã
    const existing = await this.prisma.coupon.findUnique({
      where: { code: normalizedCode },
    });
    if (existing) {
      throw new ConflictException(`Mã voucher "${normalizedCode}" đã tồn tại trong hệ thống`);
    }

    const expiryDate = data.expiresAt
      ? new Date(data.expiresAt)
      : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    return this.prisma.coupon.create({
      data: {
        code: normalizedCode,
        discountPercent: data.discountPercent ?? null,
        discountAmount: data.discountAmount ?? null,
        minOrderValue: data.minOrderValue ?? 0,
        maxUses: data.maxUses ?? 100,
        expiresAt: expiryDate,
        active: data.active ?? true,
      },
    });
  }

  async updateCoupon(
    code: string,
    data: {
      active?: boolean;
      discountPercent?: number;
      discountAmount?: number;
      minOrderValue?: number;
      maxUses?: number;
      expiresAt?: string;
    },
  ) {
    const normalizedCode = code.trim().toUpperCase();
    const existing = await this.prisma.coupon.findUnique({
      where: { code: normalizedCode },
    });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy mã voucher ${normalizedCode}`);
    }

    return this.prisma.coupon.update({
      where: { code: normalizedCode },
      data: {
        ...(typeof data.active === 'boolean' ? { active: data.active } : {}),
        ...(typeof data.discountPercent === 'number' ? { discountPercent: data.discountPercent } : {}),
        ...(typeof data.discountAmount === 'number' ? { discountAmount: data.discountAmount } : {}),
        ...(typeof data.minOrderValue === 'number' ? { minOrderValue: data.minOrderValue } : {}),
        ...(typeof data.maxUses === 'number' ? { maxUses: data.maxUses } : {}),
        ...(data.expiresAt ? { expiresAt: new Date(data.expiresAt) } : {}),
      },
    });
  }

  async deleteCoupon(code: string) {
    const normalizedCode = code.trim().toUpperCase();
    const existing = await this.prisma.coupon.findUnique({
      where: { code: normalizedCode },
      include: { _count: { select: { orders: true } } },
    });

    if (!existing) {
      throw new NotFoundException(`Không tìm thấy mã voucher ${normalizedCode}`);
    }

    // Nếu đã có đơn hàng sử dụng mã này, chuyển sang inactive để tránh Foreign Key Constraint Violation
    if (existing._count.orders > 0) {
      return this.prisma.coupon.update({
        where: { code: normalizedCode },
        data: { active: false },
      });
    }

    return this.prisma.coupon.delete({
      where: { code: normalizedCode },
    });
  }

  // ================= 5. QUẢN LÝ KHÁCH HÀNG & ĐIỂM THƯỞNG =================
  async getUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { id: 'asc' },
      include: {
        orders: {
          select: { id: true, total: true, status: true, createdAt: true },
        },
      },
    });

    const revenueStatuses: OrderStatus[] = [
      OrderStatus.PAID,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.COMPLETED,
    ];

    return users.map((u) => {
      const validOrders = u.orders.filter((o) => revenueStatuses.includes(o.status));
      const totalSpent = validOrders.reduce((sum, o) => sum + o.total, 0);

      return {
        id: u.id,
        email: u.email,
        loyaltyPoints: u.loyaltyPoints,
        orderCount: u.orders.length,
        paidOrderCount: validOrders.length,
        totalSpent,
      };
    });
  }

  async adjustUserPoints(userId: number, delta: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`Không tìm thấy khách hàng #${userId}`);
    }

    const nextPoints = Math.max(0, user.loyaltyPoints + delta);
    return this.prisma.user.update({
      where: { id: userId },
      data: { loyaltyPoints: nextPoints },
    });
  }
}

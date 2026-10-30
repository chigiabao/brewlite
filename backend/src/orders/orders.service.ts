// // @Injectable()
// // export class OrdersService {
// //   constructor(private readonly prisma: PrismaService) {}

// //   // TODO(E – Task 6): lấy giá gốc từ DB, tính lại bằng unitPrice() (common/pricing.ts),
// //   // lưu Order trạng thái PENDING kèm OrderItem, trả { id, status, total }.
// //   // TODO(E – Task 10): trừ tồn kho trong transaction (stock.service.ts) và áp couponCode qua hợp đồng Rewards (G), E chịu trách nhiệm transaction.
// //   create(userId: number, dto: CreateOrderDto) {
// //     throw new NotImplementedException('POST /orders chưa làm (E – Task 6)');
// //   }

// //   // TODO(E – Task 9): trả [{ id, status, total, createdAt }] của user, mới nhất trước.
// //   findMine(userId: number) {
// //     throw new NotImplementedException('GET /orders/me chưa làm (E – Task 9)');
// //   }
// // }

import { createHash } from 'node:crypto';
import {
  ConflictException,
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { unitPrice } from '../common/pricing.js';
import type { Size } from '../common/pricing.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto } from './orders.dto.js';
import { StockService } from './stock.service.js';
import { OrderStatus } from '../generated/prisma/enums.js';
import {
  assertPreparationTarget,
  assertTransition,
  type PreparationStatus,
} from './order-state.js';
import { REWARDS_PORT, type RewardsPort, normalizeCouponCode } from '../rewards/public.js';
import { getOrderExpiryMs } from '../config/app-config.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    @Optional()
    @Inject(REWARDS_PORT)
    private readonly rewards?: RewardsPort,
  ) {}

  async create(userId: number, dto: CreateOrderDto, idempotencyKey?: string) {
    const key = idempotencyKey?.trim();

    if (!key) {
      throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
    }

    if (key.length > 200) {
      throw new BadRequestException('IDEMPOTENCY_KEY_TOO_LONG');
    }

    // Hash dữ liệu đầu vào theo thứ tự ổn định.
    const normalizedPayload = {
      items: dto.items.map((item) => ({
        productId: item.productId,
        size: item.size,
        toppings: [...item.toppings].sort(),
        qty: item.qty,
      })),
      couponCode: dto.couponCode?.trim() ? normalizeCouponCode(dto.couponCode) : null,
      pointsToRedeem: dto.pointsToRedeem ?? 0,
    };

    const requestHash = createHash('sha256')
      .update(JSON.stringify(normalizedPayload))
      .digest('hex');

    const existing = await this.prisma.order.findFirst({
      where: { userId, idempotencyKey: key },
      select: {
        id: true,
        status: true,
        subtotal: true,
        discountTotal: true,
        pointsRedeemed: true,
        total: true,
        requestHash: true,
      },
    });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException('IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
      }

      const { requestHash: _hash, ...result } = existing;
      return result;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Kiểm tra lại trong transaction trước khi xử lý đơn.
        const duplicate = await tx.order.findFirst({
          where: { userId, idempotencyKey: key },
          select: {
            id: true,
            status: true,
            subtotal: true,
            discountTotal: true,
            pointsRedeemed: true,
            total: true,
            requestHash: true,
          },
        });

        if (duplicate) {
          if (duplicate.requestHash !== requestHash) {
            throw new ConflictException('IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
          }

          const { requestHash: _hash, ...result } = duplicate;
          return result;
        }

        const productIds = [
          ...new Set(dto.items.map((item) => item.productId)),
        ].sort((a, b) => a - b);

        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
        });

        if (products.length !== productIds.length) {
          throw new NotFoundException('PRODUCT_NOT_FOUND');
        }

        const productsById = new Map(
          products.map((product) => [product.id, product]),
        );

        const pricedItems = dto.items.map((item) => {
          const product = productsById.get(item.productId);

          if (!product) {
            throw new NotFoundException('PRODUCT_NOT_FOUND');
          }

          const price = unitPrice(
            product.price,
            item.size as Size,
            item.toppings,
          );

          return {
            productId: item.productId,
            size: item.size,
            toppings: item.toppings,
            qty: item.qty,
            unitPrice: price,
            lineTotal: price * item.qty,
          };
        });

        const subtotal = pricedItems.reduce(
          (sum, item) => sum + item.lineTotal,
          0,
        );

        let discountTotal = 0;
        let pointsRedeemed = 0;
        let total = subtotal;
        let couponCodeToSave: string | null = null;
        const requestedPoints = dto.pointsToRedeem ?? 0;
        const normalizedCoupon = dto.couponCode?.trim()
          ? normalizeCouponCode(dto.couponCode)
          : null;
        if ((normalizedCoupon || requestedPoints > 0) && !this.rewards) {
          throw new ConflictException('REWARDS_SERVICE_UNAVAILABLE');
        }

        if (this.rewards && (normalizedCoupon || requestedPoints > 0)) {
          const quote = await this.rewards.reserveCouponAndPoints(
            {
              userId,
              subtotal,
              couponCode: normalizedCoupon ?? undefined,
              pointsToRedeem: requestedPoints,
            },
            tx,
          );
          discountTotal = quote.totalDiscount;
          pointsRedeemed = quote.pointsDiscount;
          total = quote.total;
          couponCodeToSave = normalizedCoupon;
        }

        await this.stock.reserve(tx, dto.items, products);

        const createdOrder = await tx.order.create({
          data: {
            userId,
            idempotencyKey: key,
            requestHash,
            status: 'PENDING',
            subtotal,
            discountTotal,
            pointsRedeemed,
            total,
            couponCode: couponCodeToSave,
            cancelAfter: new Date(Date.now() + getOrderExpiryMs()),
            items: {
              create: pricedItems,
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

        // PENDING chỉ reserve điểm khả dụng. REDEEM ledger được ghi trong
        // transaction thanh toán PAID của F/G; cancel trước PAID hoàn reserve.

        return createdOrder;
      });
    } catch (error: unknown) {
      // Request đồng thời có thể thua unique constraint
      // hoặc gặp xung đột khi giữ tồn kho.
      if (key) {
        const winner = await this.prisma.order.findFirst({
          where: { userId, idempotencyKey: key },
          select: {
            id: true,
            status: true,
            subtotal: true,
            discountTotal: true,
            pointsRedeemed: true,
            total: true,
            requestHash: true,
          },
        });

        if (winner) {
          if (winner.requestHash !== requestHash) {
            throw new ConflictException('IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
          }

          const { requestHash: _hash, ...result } = winner;
          return result;
        }
      }

      throw error;
    }
  }

  async findMine(userId: number) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        total: true,
        createdAt: true,
      },
    });
  }

  async findOne(userId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                imageUrl: true,
              },
            },
          },
        },
        payments: {
          select: {
            id: true,
            method: true,
            status: true,
            transactionId: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng của bạn');
    }

    return order;
  }

  /**
   * FIX 08 — Chuyển bước pha chế trong nội bộ backend.
   *
   * Không mở API công khai cho khách hàng: hiện chưa có phân quyền nhân viên.
   * Khi cần làm UI cho quầy, phải xác thực role nhân viên trước khi gọi hàm này.
   *
   * Không cần transaction bao quanh thao tác đọc/ghi đơn lẻ: câu lệnh
   * updateMany với điều kiện status hiện tại là CAS nguyên tử ở PostgreSQL.
   * Nếu hai nhân viên cùng cập nhật, chỉ người đầu tiên thành công.
   */
  async advancePreparation(orderId: number, to: PreparationStatus) {
    // Chặn cả dữ liệu sai kiểu đi vào từ JavaScript/runtime.
    assertPreparationTarget(to);

    const current = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });
    if (!current) {
      throw new NotFoundException('ORDER_NOT_FOUND');
    }

    // Chặn PENDING → PREPARING, PAID → READY và mọi bước không đúng thứ tự.
    assertTransition(current.status, to);

    const result = await this.prisma.order.updateMany({
      where: { id: orderId, status: current.status },
      data: { status: to },
    });
    if (result.count !== 1) {
      // Trạng thái đã đổi sau lần đọc: không được ghi đè kết quả của request khác.
      throw new ConflictException('ORDER_STATUS_CHANGED');
    }

    // Chỉ trả thành công sau khi DB xác nhận đã cập nhật đúng một đơn.
    return { id: orderId, status: to };
  }

  async cancel(userId: number, orderId: number) {
    return this.prisma.$transaction(async (tx) => {
      // The same row lock is taken by checkout creation and the expiry worker.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;

      const order = await tx.order.findFirst({
        where: { id: orderId, userId },
        select: { id: true, userId: true, status: true, couponCode: true, pointsRedeemed: true },
      });

      if (!order) {
        throw new NotFoundException('ORDER_NOT_FOUND');
      }
      if (
        order.status !== OrderStatus.PENDING &&
        order.status !== OrderStatus.PAYMENT_FAILED
      ) {
        throw new ConflictException('ORDER_CANNOT_BE_CANCELLED');
      }

      // A checkout attempt may still be creating/refreshing a Stripe session.
      // Cancelling now could let Stripe charge an order that is already CANCELLED.
      const pendingPayment = await tx.payment.findFirst({
        where: { orderId, status: 'PENDING' },
        select: { id: true },
      });
      if (pendingPayment) {
        throw new ConflictException('ORDER_PAYMENT_IN_PROGRESS');
      }

      await this.cancelOrderInTransaction(tx, order);
      return { id: orderId, status: OrderStatus.CANCELLED };
    });
  }

  /**
   * Releases an unpaid order after its payment window has elapsed.
   * Designed for the scheduler: expected races return `cancelled: false`
   * instead of throwing, while real data-integrity failures roll back.
   */
  async cancelExpired(
    orderId: number,
    now = new Date(),
  ): Promise<{ cancelled: boolean; reason?: string; orderId: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;

      const order = await tx.order.findFirst({
        where: { id: orderId },
        select: {
          id: true,
          userId: true,
          status: true,
          couponCode: true,
          pointsRedeemed: true,
          cancelAfter: true,
        },
      });

      if (
        !order ||
        (order.status !== OrderStatus.PENDING &&
          order.status !== OrderStatus.PAYMENT_FAILED)
      ) {
        return { cancelled: false, reason: 'not-cancellable', orderId };
      }
      if (!order.cancelAfter || order.cancelAfter.getTime() > now.getTime()) {
        return { cancelled: false, reason: 'not-due', orderId };
      }

      const activeSession = await tx.payment.findFirst({
        where: {
          orderId,
          status: 'PENDING',
          stripeSessionExpiresAt: { gt: now },
        },
        select: { id: true },
      });
      if (activeSession) {
        return { cancelled: false, reason: 'payment-in-progress', orderId };
      }

      await this.cancelOrderInTransaction(tx, order);
      return { cancelled: true, orderId };
    });
  }

  private async cancelOrderInTransaction(
    tx: Prisma.TransactionClient,
    order: {
      id: number;
      userId: number;
      status: OrderStatus;
      couponCode: string | null;
      pointsRedeemed: number;
    },
  ): Promise<void> {
    // Never leave a payable attempt behind after cancelling the order.
    await tx.payment.updateMany({
      where: { orderId: order.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    });

    if ((order.couponCode || order.pointsRedeemed > 0) && !this.rewards) {
      throw new ConflictException('REWARDS_SERVICE_UNAVAILABLE');
    }

    assertTransition(order.status, OrderStatus.CANCELLED);

    const updated = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: OrderStatus.CANCELLED, cancelAfter: null },
    });
    if (updated.count !== 1) {
      throw new ConflictException('ORDER_STATUS_CHANGED');
    }

    const items = await tx.orderItem.findMany({
      where: { orderId: order.id },
      select: { productId: true, qty: true },
    });
    await this.stock.release(tx, items);

    if (this.rewards && (order.couponCode || order.pointsRedeemed > 0)) {
      await this.rewards.releaseReservedOnCancel(
        {
          orderId: order.id,
          userId: order.userId,
          couponCode: order.couponCode ?? null,
          pointsRedeemed: order.pointsRedeemed ?? 0,
        },
        tx,
      );
    }

  }
}

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
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { unitPrice } from '../common/pricing.js';
import type { Size } from '../common/pricing.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto } from './orders.dto.js';
import { StockService } from './stock.service.js';
import { OrderStatus } from '../generated/prisma/enums.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
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
      couponCode: dto.couponCode ?? null,
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

        // Chờ hợp đồng Rewards (G) để xử lý coupon và đổi điểm.
        const discountTotal = 0;
        const pointsRedeemed = 0;
        const total = subtotal;

        await this.stock.reserve(tx, dto.items, products);

        return tx.order.create({
          data: {
            userId,
            idempotencyKey: key,
            requestHash,
            status: 'PENDING',
            subtotal,
            discountTotal,
            pointsRedeemed,
            total,
            couponCode: null,
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
  async cancel(userId: number, orderId: number) {
    return this.prisma.$transaction(async (tx) => {
      // Kiểm tra đơn có thuộc user không
      const order = await tx.order.findFirst({
        where: { id: orderId, userId },
        select: { id: true, status: true },
      });

      if (!order) {
        throw new NotFoundException('ORDER_NOT_FOUND');
      }

      // Chỉ cho phép hủy đơn chưa thanh toán hoặc thanh toán thất bại
      const allowedStatuses: OrderStatus[] = [
        OrderStatus.PENDING,
        OrderStatus.PAYMENT_FAILED,
      ];

      if (!allowedStatuses.includes(order.status)) {
        throw new ConflictException('ORDER_CANNOT_BE_CANCELLED');
      }

      // CAS: chỉ một request được chuyển trạng thái thành công
      const updated = await tx.order.updateMany({
        where: {
          id: orderId,
          userId,
          status: order.status,
        },
        data: {
          status: OrderStatus.CANCELLED,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException('ORDER_STATUS_CHANGED');
      }

      // Lấy chi tiết để hoàn kho
      const items = await tx.orderItem.findMany({
        where: { orderId },
        select: {
          productId: true,
          qty: true,
        },
      });

      await this.stock.release(tx, items);

      return {
        id: orderId,
        status: OrderStatus.CANCELLED,
      };
    });
  }
}

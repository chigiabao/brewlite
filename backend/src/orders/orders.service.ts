import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums.js';
import { createHash } from 'node:crypto';
import { assertTransition } from './order-state.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { unitPrice } from '../common/pricing.js';
import {
  REWARDS_PORT,
  normalizeCouponCode,
  type RewardsPort,
  type RewardsTx,
} from '../rewards/public.js';
import type { OrderSummary } from '../contracts/public.js';
import { CreateOrderDto } from './orders.dto.js';

type OrderLineSnapshot = {
  productId: number;
  size: CreateOrderDto['items'][number]['size'];
  toppings: string[];
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

/** Header bắt buộc ở HTTP; chỉ nội bộ/fixture cũ mới được gọi service không có key. */
export function assertCreateKey(key: string | undefined): string {
  const value = key?.trim();
  if (!value || value.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new BadRequestException('Thiếu hoặc sai Idempotency-Key khi tạo đơn');
  }
  return value;
}

function createOrderHash(userId: number, dto: CreateOrderDto): string {
  // Chuẩn hóa coupon/toppings, nhưng giữ nguyên số lượng và lựa chọn món.
  return createHash('sha256').update(JSON.stringify({
    userId, coupon: dto.couponCode?.trim() ? normalizeCouponCode(dto.couponCode) : null,
    points: dto.pointsToRedeem ?? 0,
    items: dto.items.map((item) => ({ productId: item.productId, size: item.size,
      toppings: [...item.toppings].sort(), qty: item.qty })),
  })).digest('hex');
}

const SUMMARY = { id: true, status: true, subtotal: true,
  discountTotal: true, pointsRedeemed: true, total: true } as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REWARDS_PORT) private readonly rewards: RewardsPort,
  ) {}

  /**
   * Giá và tồn kho đều được đọc/ghi trong transaction. Không tin subtotal, giá
   * hoặc total do frontend gửi; frontend chỉ gửi productId và lựa chọn món.
   */
  async create(userId: number, dto: CreateOrderDto, rawKey?: string): Promise<OrderSummary> {
    const key = rawKey === undefined ? undefined : assertCreateKey(rawKey);
    const requestHash = key ? createOrderHash(userId, dto) : null;
    const replay = async (): Promise<OrderSummary | null> => {
      if (!key) return null;
      const existing = await this.prisma.order.findUnique({
        where: { userId_createKey: { userId, createKey: key } }, select: {
          ...SUMMARY, createHash: true,
        },
      });
      if (!existing) return null;
      if (existing.createHash !== requestHash) {
        throw new ConflictException('Idempotency-Key đã được dùng với giỏ hàng khác');
      }
      const { createHash: _storedHash, ...summary } = existing;
      return summary;
    };

    const previous = await replay();
    if (previous) return previous;
    try {
      return await this.prisma.$transaction(async (tx) => {
      const lines: OrderLineSnapshot[] = [];
      let subtotal = 0;

      for (const item of dto.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { id: true, price: true },
        });
        if (!product) {
          throw new NotFoundException(`Không tìm thấy sản phẩm #${item.productId}`);
        }

        const price = unitPrice(product.price, item.size, item.toppings);
        const lineTotal = price * item.qty;
        lines.push({
          productId: product.id,
          size: item.size,
          toppings: [...item.toppings],
          qty: item.qty,
          unitPrice: price,
          lineTotal,
        });
        subtotal += lineTotal;
      }

      // Reserve rewards before creating the order. Any subsequent error rolls
      // back coupon quota, loyalty balance, stock and the order atomically.
      const reward = await this.rewards.reserveCouponAndPoints(
        {
          userId,
          subtotal,
          couponCode: dto.couponCode,
          pointsToRedeem: dto.pointsToRedeem,
        },
        tx as RewardsTx,
      );

      for (const line of lines) {
        const updated = await tx.product.updateMany({
          where: {
            id: line.productId,
            stock: { gte: line.qty },
          },
          data: {
            stock: { decrement: line.qty },
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException(`Sản phẩm #${line.productId} không đủ tồn kho`);
        }
      }

      const order = await tx.order.create({
        data: {
          userId,
          createKey: key ?? null,
          createHash: requestHash,
          status: OrderStatus.PENDING,
          subtotal,
          discountTotal: reward.totalDiscount,
          pointsRedeemed: reward.pointsDiscount,
          total: reward.total,
          couponCode: dto.couponCode?.trim()
            ? normalizeCouponCode(dto.couponCode)
            : null,
          items: {
            create: lines.map((line) => ({
              productId: line.productId,
              size: line.size,
              toppings: line.toppings,
              qty: line.qty,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
            })),
          },
        },
        select: SUMMARY,
      });

      // G-03: chưa ghi REDEEM ở PENDING. Chỉ giữ balance; PAID sẽ ghi ledger.
      return order;
      });
    } catch (error) {
      // Hai request cùng key tranh nhau: transaction thua phải rollback toàn bộ reserve,
      // sau đó replay đúng snapshot của request thắng.
      if (key) {
        // Có thể lỗi quota/stock trước khi chạm unique index do request kia đã đặt xong.
        const winner = await replay();
        if (winner) return winner;
      }
      throw error;
    }
  }

  /** Hủy đơn chưa thanh toán, hoàn điểm/coupon/tồn kho atomically và đúng một lần. */
  async cancel(userId: number, orderId: number): Promise<OrderSummary> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, userId },
        select: { ...SUMMARY, items: { select: { productId: true, qty: true } } },
      });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng của bạn');
      if (order.status === OrderStatus.CANCELLED) {
        const { items: _items, ...summary } = order;
        return summary;
      }
      assertTransition(order.status, OrderStatus.CANCELLED);

      // Khóa dòng Order bằng UPDATE/CAS. Payments cũng FOR UPDATE dòng này trước
      // khi tạo attempt; hai luồng tạo payment và hủy không thể vượt nhau.
      const changed = await tx.order.updateMany({
        where: { id: orderId, userId, status: order.status },
        data: { status: OrderStatus.CANCELLED },
      });
      if (changed.count !== 1) throw new ConflictException('Trạng thái đơn vừa thay đổi');
      const pending = await tx.payment.count({
        where: { orderId, status: PaymentStatus.PENDING },
      });
      if (pending > 0) {
        throw new ConflictException('Thanh toán đang xử lý; chưa thể hủy đơn');
      }
      await this.rewards.releaseOnCancel(orderId, userId, tx as RewardsTx);
      for (const item of order.items) {
        await tx.product.update({ where: { id: item.productId },
          data: { stock: { increment: item.qty }, version: { increment: 1 } } });
      }
      return { id: order.id, status: OrderStatus.CANCELLED, subtotal: order.subtotal,
        discountTotal: order.discountTotal, pointsRedeemed: order.pointsRedeemed,
        total: order.total };
    });
  }

  /** E/G-04: luồng pha chế nội bộ, không mở endpoint để khách tự đổi trạng thái.
   * PAID → PREPARING → READY → COMPLETED; dùng CAS chống hai nhân viên đổi cùng lúc.
   */
  async advanceFulfillment(orderId: number, next: OrderStatus): Promise<OrderStatus> {
    if (![OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.COMPLETED].includes(next)) {
      throw new BadRequestException('Không hỗ trợ thao tác chuyển trạng thái này');
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
      assertTransition(order.status, next);
      const changed = await tx.order.updateMany({
        where: { id: orderId, status: order.status }, data: { status: next },
      });
      if (changed.count !== 1) throw new ConflictException('Đơn đã được cập nhật bởi tác vụ khác');
      return next;
    });
  }

  async findMine(userId: number): Promise<Array<{
    id: number;
    status: OrderStatus;
    total: number;
    createdAt: Date;
  }>> {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, total: true, createdAt: true },
    });
  }
}

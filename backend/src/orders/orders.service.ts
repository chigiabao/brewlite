import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '../generated/prisma/enums.js';
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
  async create(userId: number, dto: CreateOrderDto): Promise<OrderSummary> {
    return this.prisma.$transaction(async (tx) => {
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
        select: {
          id: true,
          status: true,
          subtotal: true,
          discountTotal: true,
          pointsRedeemed: true,
          total: true,
        },
      });

      await this.rewards.createRedeemEntry(
        { orderId: order.id, userId, points: order.pointsRedeemed },
        tx as RewardsTx,
      );

      return order;
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

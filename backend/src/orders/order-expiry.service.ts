import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersService } from './orders.service.js';
import { isAutoCancelEnabled } from '../config/app-config.js';

const BATCH_SIZE = 50;

@Injectable()
export class OrderExpiryService {
  private readonly logger = new Logger(OrderExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'order-expiry' })
  async handleCron(): Promise<void> {
    try {
      await this.cancelExpiredOrders();
    } catch (error) {
      this.logger.error(`order.expiry.cron_failed: ${(error as Error).message}`);
    }
  }

  async cancelExpiredOrders(now = new Date()): Promise<number> {
    if (!isAutoCancelEnabled()) {
      this.logger.debug?.('order.expiry.skipped: feature flag disabled');
      return 0;
    }
    const candidates = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED] },
        cancelAfter: { lte: now },
      },
      select: { id: true },
      orderBy: { cancelAfter: 'asc' },
      take: BATCH_SIZE,
    });

    let cancelled = 0;
    for (const { id } of candidates) {
      try {
        const result = await this.orders.cancelExpired(id, now);
        if (result.cancelled) {
          cancelled += 1;
          this.logger.log(`order.auto_cancelled orderId=${id}`);
        }
      } catch (error) {
        // Keep processing the batch; the failed order rolls back atomically and
        // will be retried on the next tick.
        this.logger.error(
          `order.auto_cancel_failed orderId=${id}: ${(error as Error).message}`,
        );
      }
    }

    return cancelled;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { assertTransition } from '../orders/public.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentError, PaymentErrorCode } from './payment.errors.js';

export const ORDERS_PAYMENT_PORT = Symbol('ORDERS_PAYMENT_PORT');

export type PaymentTx = Prisma.TransactionClient;

export type PayableOrder = {
  id: number;
  userId: number;
  status: OrderStatus;
  total: number;
};

export interface OrdersPaymentPort {
  findOrderForUser(orderId: number, userId: number): Promise<PayableOrder | null>;
  markPending(orderId: number, tx?: PaymentTx): Promise<void>;
  markPaid(orderId: number, paymentId: number, tx?: PaymentTx): Promise<void>;
  markPaymentFailed(orderId: number, paymentId: number, tx?: PaymentTx): Promise<void>;
}

@Injectable()
export class MockOrdersPaymentAdapter implements OrdersPaymentPort {
  private readonly logger = new Logger(MockOrdersPaymentAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  async findOrderForUser(orderId: number, userId: number): Promise<PayableOrder | null> {
    return this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true, userId: true, status: true, total: true },
    });
  }

  markPending(orderId: number, tx?: PaymentTx): Promise<void> {
    return this.transition(orderId, OrderStatus.PENDING, undefined, tx);
  }

  markPaid(orderId: number, paymentId: number, tx?: PaymentTx): Promise<void> {
    return this.transition(orderId, OrderStatus.PAID, paymentId, tx);
  }

  markPaymentFailed(orderId: number, paymentId: number, tx?: PaymentTx): Promise<void> {
    return this.transition(orderId, OrderStatus.PAYMENT_FAILED, paymentId, tx);
  }

  private async transition(
    orderId: number,
    to: OrderStatus,
    paymentId?: number,
    tx?: PaymentTx,
  ): Promise<void> {
    const order = tx
      ? await tx.order.findUnique({ where: { id: orderId }, select: { status: true } })
      : await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!order) {
      throw new PaymentError(PaymentErrorCode.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng', 404);
    }
    assertTransition(order.status, to);
    if (tx) {
      await tx.order.update({ where: { id: orderId }, data: { status: to } });
    } else {
      await this.prisma.order.update({ where: { id: orderId }, data: { status: to } });
    }
    const paymentLog = paymentId === undefined ? '' : ` paymentId=${paymentId}`;
    this.logger.log(`payment.order.${to} orderId=${orderId}${paymentLog}`);
  }
}

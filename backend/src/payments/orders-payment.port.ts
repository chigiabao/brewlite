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
  findOrderForUser(
    orderId: number,
    userId: number,
  ): Promise<PayableOrder | null>;
  markPending(orderId: number, tx?: PaymentTx): Promise<void>;
  markPaid(orderId: number, paymentId: number, tx?: PaymentTx): Promise<void>;
  markPaymentFailed(
    orderId: number,
    paymentId: number,
    tx?: PaymentTx,
  ): Promise<void>;
}

@Injectable()
export class MockOrdersPaymentAdapter implements OrdersPaymentPort {
  private readonly logger = new Logger(MockOrdersPaymentAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  async findOrderForUser(
    orderId: number,
    userId: number,
  ): Promise<PayableOrder | null> {
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

  markPaymentFailed(
    orderId: number,
    paymentId: number,
    tx?: PaymentTx,
  ): Promise<void> {
    return this.transition(orderId, OrderStatus.PAYMENT_FAILED, paymentId, tx);
  }

  private async transition(
    orderId: number,
    to: OrderStatus,
    paymentId?: number,
    tx?: PaymentTx,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    const order = await client.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });

    if (!order) {
      throw new PaymentError(
        PaymentErrorCode.ORDER_NOT_FOUND,
        'Không tìm thấy đơn hàng',
        404,
      );
    }

    assertTransition(order.status, to);

    const result = await client.order.updateMany({
      where: {
        id: orderId,
        status: order.status,
      },
      data: { status: to },
    });

    if (result.count !== 1) {
      throw new PaymentError(
        PaymentErrorCode.ORDER_NOT_PAYABLE,
        'Trạng thái đơn hàng đã thay đổi',
        409,
      );
    }

    const paymentLog = paymentId === undefined ? '' : ` paymentId=${paymentId}`;

    this.logger.log(`payment.order.${to} orderId=${orderId}${paymentLog}`);
  }
}

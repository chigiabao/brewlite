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

  markPaid(orderId: number, paymentId: number, tx?: PaymentTx): Promise<void> {
    return this.transition(orderId, OrderStatus.PAID, paymentId, tx);
  }

  markPaymentFailed(orderId: number, paymentId: number, tx?: PaymentTx): Promise<void> {
    return this.transition(orderId, OrderStatus.PAYMENT_FAILED, paymentId, tx);
  }

  private async transition(
    orderId: number,
    to: OrderStatus,
    paymentId: number,
    tx?: PaymentTx,
  ): Promise<void> {
    const order = tx
      ? await tx.order.findUnique({ where: { id: orderId }, select: { status: true } })
      : await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!order) {
      throw new PaymentError(PaymentErrorCode.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng', 404);
    }
    // Retry bị từ chối thêm lần nữa: Order vốn là PAYMENT_FAILED, không cần
    // tự chuyển PAYMENT_FAILED → PAYMENT_FAILED (state machine không cho phép).
    if (to === OrderStatus.PAYMENT_FAILED && order.status === OrderStatus.PAYMENT_FAILED) {
      return;
    }
    assertTransition(order.status, to);
    // G-04: compare-and-swap theo trạng thái đã đọc; CANCELLED không được bị PAID ghi đè.
    const client = tx ?? this.prisma;
    const updated = await client.order.updateMany({
      where: { id: orderId, status: order.status },
      data: { status: to },
    });
    if (updated.count !== 1) {
      throw new PaymentError(PaymentErrorCode.ORDER_NOT_PAYABLE,
        'Trạng thái đơn thay đổi trong khi thanh toán', 409);
    }
    this.logger.log(`payment.order.${to} orderId=${orderId} paymentId=${paymentId}`);
  }
}

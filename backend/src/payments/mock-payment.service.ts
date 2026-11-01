/**
 * FIX 11 — Cổng thanh toán Mock an toàn cho demo local.
 * Không liên hệ ngân hàng. Mọi thao tác payment/order/loyalty trong một transaction;
 * khóa Order FOR UPDATE tránh hai lượt thanh toán cạnh tranh.
 */
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isMockDeclineEnabled } from '../config/app-config.js';
import { ORDERS_PAYMENT_PORT, type OrdersPaymentPort } from './orders-payment.port.js';
import { REWARDS_PORT, type RewardsPort } from '../rewards/public.js';
import { PaymentError, PaymentErrorCode } from './payment.errors.js';
import type { PayInput } from './payment.types.js';

export type MockPayInput = PayInput & { demoDecline: boolean };
export type MockPayResult = {
  orderId: number;
  paymentId: number;
  status: 'SUCCEEDED' | 'FAILED';
  orderStatus: 'PAID' | 'PAYMENT_FAILED';
  idempotentReplay: boolean;
};

export function mockRequestHash(input: MockPayInput): string {
  return createHash('sha256')
    .update(JSON.stringify([input.userId, input.orderId, input.method, input.demoDecline]))
    .digest('hex');
}

function checkKey(key: string | undefined): string {
  const value = key?.trim();
  if (!value) {
    throw new PaymentError(PaymentErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Thiếu Idempotency-Key', 400);
  }
  if (value.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new PaymentError(PaymentErrorCode.INVALID_IDEMPOTENCY_KEY, 'Idempotency-Key không hợp lệ', 400);
  }
  return value;
}

@Injectable()
export class MockPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ORDERS_PAYMENT_PORT) private readonly orders: OrdersPaymentPort,
    @Inject(REWARDS_PORT) private readonly rewards: RewardsPort,
  ) {}

  async pay(input: MockPayInput): Promise<MockPayResult> {
    const key = checkKey(input.idempotencyKey);
    if (input.demoDecline && !isMockDeclineEnabled()) {
      throw new PaymentError(PaymentErrorCode.ORDER_NOT_PAYABLE,
        'Chế độ mô phỏng giao dịch thất bại chưa được bật trên máy local', 400);
    }
    const hash = mockRequestHash(input);

    return this.prisma.$transaction(async (tx) => {
      // Khóa đúng hàng Order (kể cả khi nhận request đồng thời với key khác).
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} AND "userId" = ${input.userId} FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: { id: input.orderId, userId: input.userId },
        select: { id: true, userId: true, status: true, total: true, pointsRedeemed: true },
      });
      if (!order) {
        throw new PaymentError(PaymentErrorCode.ORDER_NOT_FOUND,
          'Không tìm thấy đơn hàng của tài khoản hiện tại', 404);
      }

      // Replay cùng key trả về kết quả gốc, không cộng thưởng lần thứ hai.
      const existing = await tx.payment.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        if (existing.orderId !== order.id || existing.requestHash !== hash) {
          throw new PaymentError(PaymentErrorCode.IDEMPOTENCY_KEY_REUSED,
            'Khóa đã được dùng cho request khác', 409);
        }
        if (existing.status === PaymentStatus.SUCCEEDED || existing.status === PaymentStatus.FAILED) {
          if (existing.status === PaymentStatus.SUCCEEDED &&
              ![OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.READY,
                OrderStatus.COMPLETED].includes(order.status)) {
            throw new PaymentError(PaymentErrorCode.ORDER_NOT_PAYABLE,
              'Đơn đã thay đổi trạng thái sau lần thanh toán thành công', 409);
          }
          return {
            orderId: order.id, paymentId: existing.id,
            status: existing.status,
            orderStatus: existing.status === PaymentStatus.SUCCEEDED ? 'PAID' : 'PAYMENT_FAILED',
            idempotentReplay: true,
          };
        }
        throw new PaymentError(PaymentErrorCode.PAYMENT_IN_PROGRESS,
          'Giao dịch trước vẫn đang xử lý, vui lòng kiểm tra lại', 409);
      }

      if (order.status === OrderStatus.PAID || order.status === OrderStatus.PREPARING ||
          order.status === OrderStatus.READY || order.status === OrderStatus.COMPLETED) {
        throw new PaymentError(PaymentErrorCode.ORDER_ALREADY_PAID, 'Đơn đã được thanh toán', 409);
      }
      if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAYMENT_FAILED) {
        throw new PaymentError(PaymentErrorCode.ORDER_NOT_PAYABLE,
          `Không thể thanh toán đơn ở trạng thái ${order.status}`, 409);
      }
      // Không được phá hủy Payment PENDING của Stripe khi người dùng đổi cấu hình.
      const pending = await tx.payment.findFirst({
        where: { orderId: order.id, status: PaymentStatus.PENDING },
      });
      if (pending) {
        throw new PaymentError(PaymentErrorCode.PAYMENT_IN_PROGRESS,
          'Đơn đang có lượt thanh toán chưa kết thúc', 409);
      }
      if (order.status === OrderStatus.PAYMENT_FAILED) {
        await this.orders.markPending(order.id, tx);
      }

      const payment = await tx.payment.create({
        data: {
          orderId: order.id, method: input.method, amount: order.total,
          idempotencyKey: key, requestHash: hash, status: PaymentStatus.PENDING,
        },
      });
      if (input.demoDecline) {
        await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });
        await this.orders.markPaymentFailed(order.id, payment.id, tx);
        return { orderId: order.id, paymentId: payment.id, status: 'FAILED',
          orderStatus: 'PAYMENT_FAILED', idempotentReplay: false };
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.SUCCEEDED,
          transactionId: `MOCK-${payment.id}`, paidAt: new Date() },
      });
      await this.orders.markPaid(order.id, payment.id, tx);
      await this.rewards.finalizeRewardsOnPaid({
        orderId: order.id, userId: order.userId,
        totalPaid: order.total, pointsRedeemed: order.pointsRedeemed ?? 0,
      }, tx);
      return { orderId: order.id, paymentId: payment.id, status: 'SUCCEEDED',
        orderStatus: 'PAID', idempotentReplay: false };
    });
  }
}

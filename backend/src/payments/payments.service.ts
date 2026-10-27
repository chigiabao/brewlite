import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Payment } from '../generated/prisma/client.js';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REWARDS_PORT, type RewardsPort } from '../rewards/public.js';
import { MockGatewayService } from './mock-gateway.service.js';
import {
  ORDERS_PAYMENT_PORT,
  type OrdersPaymentPort,
  type PayableOrder,
} from './orders-payment.port.js';
import {
  GatewayTimeoutError,
  PaymentDeclinedError,
  PaymentError,
  PaymentErrorCode,
} from './payment.errors.js';
import type { PayInput, PaymentResult } from './payment.types.js';

const IDEMPOTENCY_KEY_MAX_LENGTH = 200;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

export function paymentRequestHash(input: {
  userId: number;
  orderId: number;
  method: string;
}): string {
  return createHash('sha256')
    .update(JSON.stringify([input.userId, input.orderId, input.method]))
    .digest('hex');
}

function assertValidIdempotencyKey(key: string | undefined): string {
  const trimmed = key?.trim();
  if (!trimmed) {
    throw new PaymentError(
      PaymentErrorCode.IDEMPOTENCY_KEY_REQUIRED,
      'Thiếu header Idempotency-Key',
      400,
    );
  }
  if (trimmed.length > IDEMPOTENCY_KEY_MAX_LENGTH || !IDEMPOTENCY_KEY_PATTERN.test(trimmed)) {
    throw new PaymentError(
      PaymentErrorCode.INVALID_IDEMPOTENCY_KEY,
      'Idempotency-Key sai định dạng',
      400,
    );
  }
  return trimmed;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MockGatewayService,
    @Inject(ORDERS_PAYMENT_PORT) private readonly orders: OrdersPaymentPort,
    @Inject(REWARDS_PORT) private readonly rewards: RewardsPort,
  ) {}

  async pay(input: PayInput): Promise<PaymentResult> {
    const idempotencyKey = assertValidIdempotencyKey(input.idempotencyKey);
    const requestHash = paymentRequestHash({
      userId: input.userId,
      orderId: input.orderId,
      method: input.method,
    });

    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) return this.replay(existing, requestHash);

    const order = await this.orders.findOrderForUser(input.orderId, input.userId);
    if (!order) {
      throw new PaymentError(PaymentErrorCode.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng của bạn', 404);
    }
    this.assertPayable(order);
    if (order.status === OrderStatus.PAYMENT_FAILED) {
      await this.prepareRetry(order);
    }

    const amount = order.total;

    let payment: Payment;
    try {
      payment = await this.prisma.payment.create({
        data: {
          orderId: order.id,
          idempotencyKey,
          requestHash,
          amount,
          method: input.method,
          status: PaymentStatus.PENDING,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
      if (winner) return this.replay(winner, requestHash);
      throw error;
    }

    return this.chargeAndSettle(payment);
  }

  private async chargeAndSettle(payment: Payment): Promise<PaymentResult> {
    let reference: string;
    try {
      const result = await this.gateway.charge({
        paymentId: payment.id,
        orderId: payment.orderId,
        amount: payment.amount,
        method: payment.method,
      });
      reference = result.reference;
    } catch (error) {
      return this.handleGatewayFailure(payment, error);
    }

    // G-02: markPaid + finalizeRewardsOnPaid trong cùng transaction → exactly-once
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.SUCCEEDED, transactionId: reference },
      });
      await this.orders.markPaid(payment.orderId, payment.id, tx);

      // Lấy thông tin userId và total để cộng điểm; idempotent (unique LoyaltyEntry guard).
      const order = await tx.order.findUnique({
        where: { id: payment.orderId },
        select: { userId: true, total: true },
      });
      if (order) {
        await this.rewards.finalizeRewardsOnPaid(
          { orderId: payment.orderId, userId: order.userId, totalPaid: order.total },
          tx,
        );
      }
    });

    this.logger.log(
      `payment.succeeded orderId=${payment.orderId} paymentId=${payment.id} reference=${reference}`,
    );
    return this.toResult(
      { ...payment, status: PaymentStatus.SUCCEEDED, transactionId: reference },
      OrderStatus.PAID,
      false,
    );
  }

  private async handleGatewayFailure(payment: Payment, error: unknown): Promise<never> {
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      await this.orders.markPaymentFailed(payment.orderId, payment.id, tx);
    });

    if (error instanceof PaymentDeclinedError) {
      this.logger.warn(
        `payment.declined orderId=${payment.orderId} paymentId=${payment.id} reference=${error.reference}`,
      );
      throw new PaymentError(
        PaymentErrorCode.PAYMENT_DECLINED,
        'Thanh toán bị từ chối. Giỏ hàng được giữ nguyên để thử lại.',
        402,
        { paymentId: payment.id, orderStatus: OrderStatus.PAYMENT_FAILED },
      );
    }

    if (error instanceof GatewayTimeoutError) {
      this.logger.warn(
        `payment.gateway.timeout orderId=${payment.orderId} paymentId=${payment.id}`,
      );
      throw new PaymentError(
        PaymentErrorCode.GATEWAY_TIMEOUT,
        'Gateway không phản hồi. Tạo lượt thử mới với Idempotency-Key mới.',
        504,
        { paymentId: payment.id, orderStatus: OrderStatus.PAYMENT_FAILED },
      );
    }

    this.logger.error(
      `payment.internal_error orderId=${payment.orderId} paymentId=${payment.id} message=${
        error instanceof Error ? error.message : 'unknown'
      }`,
    );
    throw new PaymentError(
      PaymentErrorCode.PAYMENT_INTERNAL_ERROR,
      'Lỗi xử lý thanh toán',
      500,
      { paymentId: payment.id },
    );
  }

  private replay(existing: Payment, requestHash: string): PaymentResult {
    if (existing.requestHash !== requestHash) {
      throw new PaymentError(
        PaymentErrorCode.IDEMPOTENCY_KEY_REUSED,
        'Idempotency-Key đã được dùng với request khác',
        409,
        { paymentId: existing.id },
      );
    }

    if (existing.status === PaymentStatus.PENDING) {
      throw new PaymentError(
        PaymentErrorCode.PAYMENT_IN_PROGRESS,
        'Yêu cầu cùng Idempotency-Key đang xử lý, thử lại sau',
        409,
        { paymentId: existing.id },
      );
    }

    if (existing.status === PaymentStatus.FAILED) {
      throw new PaymentError(
        PaymentErrorCode.PAYMENT_DECLINED,
        'Thanh toán trước đó đã thất bại. Tạo lượt thử mới với Idempotency-Key mới.',
        402,
        {
          paymentId: existing.id,
          orderStatus: OrderStatus.PAYMENT_FAILED,
          idempotentReplay: true,
        },
      );
    }

    this.logger.log(
      `payment.idempotency.replay orderId=${existing.orderId} paymentId=${existing.id}`,
    );
    return this.toResult(existing, OrderStatus.PAID, true);
  }

  private assertPayable(order: PayableOrder): void {
    if (order.status === OrderStatus.PAID) {
      throw new PaymentError(PaymentErrorCode.ORDER_ALREADY_PAID, 'Đơn hàng đã được thanh toán', 409);
    }
    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAYMENT_FAILED) {
      throw new PaymentError(
        PaymentErrorCode.ORDER_NOT_PAYABLE,
        `Đơn hàng ở trạng thái ${order.status} không thể thanh toán`,
        409,
      );
    }
  }

  private async prepareRetry(order: PayableOrder): Promise<void> {
    try {
      await this.orders.markPending(order.id);
      this.logger.log(`payment.order.retry orderId=${order.id}`);
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;

      const current = await this.orders.findOrderForUser(order.id, order.userId);
      if (!current) {
        throw new PaymentError(
          PaymentErrorCode.ORDER_NOT_FOUND,
          'Không tìm thấy đơn hàng của bạn',
          404,
        );
      }
      if (current.status === OrderStatus.PAID) {
        throw new PaymentError(
          PaymentErrorCode.ORDER_ALREADY_PAID,
          'Đơn hàng đã được thanh toán',
          409,
        );
      }
      if (current.status === OrderStatus.PENDING) {
        throw new PaymentError(
          PaymentErrorCode.PAYMENT_IN_PROGRESS,
          'Đơn hàng đang được xử lý bởi một lượt thanh toán khác, thử lại sau',
          409,
          { orderId: order.id },
        );
      }
      throw new PaymentError(
        PaymentErrorCode.ORDER_NOT_PAYABLE,
        `Đơn hàng ở trạng thái ${current.status} không thể thanh toán`,
        409,
      );
    }
  }

  private toResult(
    payment: Payment,
    orderStatus: OrderStatus,
    idempotentReplay: boolean,
  ): PaymentResult {
    return {
      orderId: payment.orderId,
      paymentId: payment.id,
      status: payment.status,
      orderStatus,
      method: payment.method,
      amount: payment.amount,
      transactionId: payment.transactionId ?? null,
      idempotentReplay,
    };
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Payment } from '../generated/prisma/client.js';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REWARDS_PORT, type RewardsPort } from '../rewards/public.js';
import { MockGatewayService } from './mock-gateway.service.js';
import {
  ORDERS_PAYMENT_PORT, type OrdersPaymentPort, type PayableOrder,
} from './orders-payment.port.js';
import {
  GatewayTimeoutError, PaymentDeclinedError, PaymentError, PaymentErrorCode,
} from './payment.errors.js';
import type { PayInput, PaymentResult } from './payment.types.js';

// G-04: lease che chắn callback chạy chậm; retry chỉ được cùng key sau khi hết lease.
const PROCESSING_LEASE_MS = 60_000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

export function paymentRequestHash(input: { userId: number; orderId: number; method: string }): string {
  return createHash('sha256').update(JSON.stringify([
    input.userId, input.orderId, input.method,
  ])).digest('hex');
}

function assertValidIdempotencyKey(key: string | undefined): string {
  const trimmed = key?.trim();
  if (!trimmed) {
    throw new PaymentError(PaymentErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Thiếu Idempotency-Key', 400);
  }
  if (trimmed.length > 200 || !IDEMPOTENCY_KEY_PATTERN.test(trimmed)) {
    throw new PaymentError(PaymentErrorCode.INVALID_IDEMPOTENCY_KEY, 'Idempotency-Key sai định dạng', 400);
  }
  return trimmed;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    ((error as { code?: string }).code === 'P2002' ||
      (error as { code?: string }).code === '23505');
}

function leaseUntil() { return new Date(Date.now() + PROCESSING_LEASE_MS); }

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
    const requestHash = paymentRequestHash(input);
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) return this.replayOrResume(existing, requestHash, input);

    const order = await this.orders.findOrderForUser(input.orderId, input.userId);
    if (!order) throw new PaymentError(PaymentErrorCode.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng của bạn', 404);
    this.assertPayable(order);

    let payment: Payment;
    try {
      // SELECT FOR UPDATE đồng bộ với CAS cancel: không thể thanh toán một order vừa bị hủy.
      payment = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`;
        const locked = await tx.order.findFirst({
          where: { id: order.id, userId: input.userId },
          select: { id: true, userId: true, status: true, total: true },
        });
        if (!locked) throw new PaymentError(PaymentErrorCode.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng', 404);
        this.assertPayable(locked);
        return tx.payment.create({
          data: { orderId: locked.id, idempotencyKey, requestHash, amount: locked.total,
            method: input.method, status: PaymentStatus.PENDING, processingLeaseUntil: leaseUntil() },
        });
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
      if (winner) return this.replayOrResume(winner, requestHash, input);
      // Partial unique index theo order không cho hai key tranh cùng một khoản tiền.
      const current = await this.orders.findOrderForUser(input.orderId, input.userId);
      if (current?.status === OrderStatus.PAID) {
        throw new PaymentError(PaymentErrorCode.ORDER_ALREADY_PAID, 'Đơn hàng đã thanh toán', 409);
      }
      throw new PaymentError(PaymentErrorCode.PAYMENT_IN_PROGRESS,
        'Đơn hàng đã có payment đang xử lý; không dùng key khác', 409);
    }

    return this.chargeAndSettle(payment, order);
  }

  private async replayOrResume(existing: Payment, requestHash: string,
    input: PayInput): Promise<PaymentResult> {
    if (existing.requestHash !== requestHash) {
      throw new PaymentError(PaymentErrorCode.IDEMPOTENCY_KEY_REUSED,
        'Idempotency-Key đã được dùng với request khác', 409, { paymentId: existing.id });
    }
    if (existing.status === PaymentStatus.SUCCEEDED) {
      return this.toResult(existing, OrderStatus.PAID, true);
    }
    if (existing.status === PaymentStatus.FAILED) {
      throw new PaymentError(PaymentErrorCode.PAYMENT_DECLINED,
        'Lượt thanh toán trước đã thất bại; dùng key mới để thử lại', 402,
        { paymentId: existing.id, orderStatus: OrderStatus.PAYMENT_FAILED, idempotentReplay: true });
    }
    if (existing.processingLeaseUntil && existing.processingLeaseUntil > new Date()) {
      throw new PaymentError(PaymentErrorCode.PAYMENT_IN_PROGRESS,
        'Thanh toán chưa xác định kết quả; giữ nguyên key, thử lại sau', 409,
        { paymentId: existing.id });
    }
    // G-04: sau timeout / settlement rollback, CHỈ phục hồi attempt cũ với paymentId cũ.
    // Gateway phải idempotent theo paymentId; không tạo lần charge mới bằng key khác.
    const claimed = await this.prisma.payment.updateMany({
      where: { id: existing.id, status: PaymentStatus.PENDING,
        OR: [{ processingLeaseUntil: null }, { processingLeaseUntil: { lte: new Date() } }] },
      data: { processingLeaseUntil: leaseUntil() },
    });
    if (claimed.count !== 1) {
      throw new PaymentError(PaymentErrorCode.PAYMENT_IN_PROGRESS, 'Đang đối soát payment', 409);
    }
    const order = await this.orders.findOrderForUser(input.orderId, input.userId);
    if (!order || ![OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED].includes(order.status)) {
      throw new PaymentError(PaymentErrorCode.ORDER_NOT_PAYABLE, 'Đơn không thể thanh toán', 409);
    }
    return this.chargeAndSettle(existing, order);
  }

  private async chargeAndSettle(payment: Payment, orderSnapshot: PayableOrder): Promise<PaymentResult> {
    let reference: string;
    try {
      const result = await this.gateway.charge({
        paymentId: payment.id, orderId: payment.orderId,
        amount: payment.amount, method: payment.method,
      });
      reference = result.reference;
    } catch (error) {
      return this.handleGatewayFailure(payment, error);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.SUCCEEDED, transactionId: reference,
            processingLeaseUntil: null },
        });
        if (updated.count !== 1) {
          throw new PaymentError(PaymentErrorCode.PAYMENT_IN_PROGRESS,
            'Payment đã được xử lý bởi request khác', 409);
        }
        await this.orders.markPaid(payment.orderId, payment.id, tx);
        await this.rewards.finalizeRewardsOnPaid({ orderId: payment.orderId,
          userId: orderSnapshot.userId, totalPaid: orderSnapshot.total }, tx);
      });
    } catch (error) {
      // Rất quan trọng: gateway có thể đã thu tiền. Không chuyển FAILED, không cho key mới.
      this.logger.error(`payment.settlement.uncertain orderId=${payment.orderId} paymentId=${payment.id}`);
      throw new PaymentError(PaymentErrorCode.PAYMENT_RECONCILIATION_REQUIRED,
        'Gateway có thể đã nhận tiền; giữ nguyên Idempotency-Key để đối soát', 503,
        { paymentId: payment.id });
    }

    this.logger.log(`payment.succeeded orderId=${payment.orderId} paymentId=${payment.id}`);
    return this.toResult({ ...payment, status: PaymentStatus.SUCCEEDED,
      transactionId: reference }, OrderStatus.PAID, false);
  }

  private async handleGatewayFailure(payment: Payment, error: unknown): Promise<never> {
    if (error instanceof PaymentDeclinedError) {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({ where: { id: payment.id },
          data: { status: PaymentStatus.FAILED, processingLeaseUntil: null } });
        await this.orders.markPaymentFailed(payment.orderId, payment.id, tx);
      });
      throw new PaymentError(PaymentErrorCode.PAYMENT_DECLINED,
        'Thanh toán bị từ chối; có thể thử lại bằng key mới', 402,
        { paymentId: payment.id, orderStatus: OrderStatus.PAYMENT_FAILED });
    }
    // Timeout và lỗi hệ thống là UNKNOWN, tuyệt đối không coi là FAILED.
    if (error instanceof GatewayTimeoutError) {
      throw new PaymentError(PaymentErrorCode.GATEWAY_TIMEOUT,
        'Gateway timeout, chưa xác định đã thu tiền hay chưa; giữ nguyên key để đối soát', 504,
        { paymentId: payment.id });
    }
    this.logger.error(`payment.gateway.unknown orderId=${payment.orderId} paymentId=${payment.id}`);
    throw new PaymentError(PaymentErrorCode.PAYMENT_RECONCILIATION_REQUIRED,
      'Gateway không xác định trạng thái; giữ nguyên key để đối soát', 503,
      { paymentId: payment.id });
  }

  private assertPayable(order: PayableOrder): void {
    if (order.status === OrderStatus.PAID) {
      throw new PaymentError(PaymentErrorCode.ORDER_ALREADY_PAID, 'Đơn hàng đã được thanh toán', 409);
    }
    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAYMENT_FAILED) {
      throw new PaymentError(PaymentErrorCode.ORDER_NOT_PAYABLE,
        `Đơn hàng ở trạng thái ${order.status} không thể thanh toán`, 409);
    }
  }

  private toResult(payment: Payment, orderStatus: OrderStatus,
    idempotentReplay: boolean): PaymentResult {
    return { orderId: payment.orderId, paymentId: payment.id, status: payment.status,
      orderStatus, method: payment.method, amount: payment.amount,
      transactionId: payment.transactionId ?? null, idempotentReplay };
  }
}

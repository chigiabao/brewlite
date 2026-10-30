import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import type { Payment } from '../generated/prisma/client.js';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REWARDS_PORT, type RewardsPort } from '../rewards/public.js';
import {
  ORDERS_PAYMENT_PORT,
  type OrdersPaymentPort,
  type PayableOrder,
} from './orders-payment.port.js';
import { PaymentError, PaymentErrorCode } from './payment.errors.js';
import { STRIPE_CLIENT } from './stripe.provider.js';
import type {
  CreateCheckoutResult,
  PayInput,
  StripeWebhookResult,
} from './payment.types.js';

const IDEMPOTENCY_KEY_MAX_LENGTH = 200;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;
const CHECKOUT_SESSION_TTL_SECONDS = 31 * 60;
const PAID_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.COMPLETED,
];

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

function isPermanentStripeError(error: unknown): boolean {
  const type = (error as { type?: string } | null)?.type;
  return (
    type === 'StripeInvalidRequestError' ||
    type === 'StripeCardError' ||
    type === 'StripeAuthenticationError' ||
    type === 'StripePermissionError' ||
    type === 'StripeIdempotencyError'
  );
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  if (typeof session.payment_intent === 'string') return session.payment_intent;
  return session.payment_intent?.id ?? null;
}

function isPaidOrderStatus(status: OrderStatus): boolean {
  return PAID_ORDER_STATUSES.includes(status);
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    @Inject(ORDERS_PAYMENT_PORT) private readonly orders: OrdersPaymentPort,
    @Inject(REWARDS_PORT) private readonly rewards: RewardsPort,
  ) {}

  // ============================================================
  // 1. CREATE / RESUME CHECKOUT — FE gọi, nhận URL redirect sang Stripe
  // ============================================================
  async createCheckout(input: PayInput): Promise<CreateCheckoutResult> {
    const idempotencyKey = assertValidIdempotencyKey(input.idempotencyKey);
    const requestHash = paymentRequestHash({
      userId: input.userId,
      orderId: input.orderId,
      method: input.method,
    });

    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return this.resumeExistingCheckout(existing, requestHash, input);
    }

    // Một order có thể có nhiều attempt, nhưng tại một thời điểm chỉ được có
    // tối đa một Payment PENDING (xem migration partial unique index).
    for (let cycle = 0; cycle < 2; cycle += 1) {
      let outcome: {
        payment: Payment;
        order: PayableOrder;
        reusedActive: boolean;
      };

      try {
        outcome = await this.createOrReusePendingPayment(input, requestHash);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;

        const winnerByKey = await this.prisma.payment.findUnique({
          where: { idempotencyKey },
        });
        if (winnerByKey) {
          return this.resumeExistingCheckout(winnerByKey, requestHash, input);
        }

        const active = await this.prisma.payment.findFirst({
          where: { orderId: input.orderId, status: PaymentStatus.PENDING },
          orderBy: { id: 'asc' },
        });
        if (active) {
          const order = await this.orders.findOrderForUser(input.orderId, input.userId);
          if (!order) {
            throw new PaymentError(
              PaymentErrorCode.ORDER_NOT_FOUND,
              'Không tìm thấy đơn hàng của bạn',
              404,
            );
          }
          return this.ensureCheckoutSession(active, order, true);
        }

        throw error;
      }

      try {
        const result = await this.ensureCheckoutSession(
          outcome.payment,
          outcome.order,
          outcome.reusedActive,
        );
        return {
          ...result,
          idempotentReplay: outcome.reusedActive,
        };
      } catch (error) {
        if (
          outcome.reusedActive &&
          error instanceof PaymentError &&
          error.code === PaymentErrorCode.STRIPE_SESSION_EXPIRED
        ) {
          // Active PENDING payment belonged to an expired Stripe session.
          // It has been marked FAILED; retry once with this request's new key.
          continue;
        }
        throw error;
      }
    }

    throw new PaymentError(
      PaymentErrorCode.PAYMENT_IN_PROGRESS,
      'Không thể tạo phiên thanh toán mới, vui lòng thử lại',
      409,
      { orderId: input.orderId },
    );
  }

  private async createOrReusePendingPayment(
    input: PayInput,
    requestHash: string,
  ): Promise<{ payment: Payment; order: PayableOrder; reusedActive: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      // Serialize checkout creation by order. This lock is what prevents two
      // different Idempotency-Key values from opening two payable sessions.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;

      const order = await tx.order.findFirst({
        where: { id: input.orderId, userId: input.userId },
        select: { id: true, userId: true, status: true, total: true },
      });
      if (!order) {
        throw new PaymentError(
          PaymentErrorCode.ORDER_NOT_FOUND,
          'Không tìm thấy đơn hàng của bạn',
          404,
        );
      }

      this.assertPayable(order);

      if (order.status === OrderStatus.PAYMENT_FAILED) {
        await this.orders.markPending(order.id, tx);
        order.status = OrderStatus.PENDING;
      }

      const active = await tx.payment.findFirst({
        where: { orderId: order.id, status: PaymentStatus.PENDING },
        orderBy: { id: 'asc' },
      });

      if (active) {
        if (
          active.idempotencyKey === input.idempotencyKey &&
          active.requestHash !== requestHash
        ) {
          throw new PaymentError(
            PaymentErrorCode.IDEMPOTENCY_KEY_REUSED,
            'Idempotency-Key đã được dùng với request khác',
            409,
            { paymentId: active.id },
          );
        }
        return { payment: active, order, reusedActive: true };
      }

      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          idempotencyKey: input.idempotencyKey!,
          requestHash,
          amount: order.total,
          method: input.method,
          status: PaymentStatus.PENDING,
        },
      });

      return { payment, order, reusedActive: false };
    });
  }

  private async resumeExistingCheckout(
    existing: Payment,
    requestHash: string,
    input: PayInput,
  ): Promise<CreateCheckoutResult> {
    if (existing.requestHash !== requestHash) {
      throw new PaymentError(
        PaymentErrorCode.IDEMPOTENCY_KEY_REUSED,
        'Idempotency-Key đã được dùng với request khác',
        409,
        { paymentId: existing.id },
      );
    }

    if (existing.status === PaymentStatus.SUCCEEDED) {
      throw new PaymentError(
        PaymentErrorCode.ORDER_ALREADY_PAID,
        'Đơn hàng đã được thanh toán',
        409,
        { paymentId: existing.id, orderId: existing.orderId },
      );
    }

    if (existing.status === PaymentStatus.FAILED) {
      throw new PaymentError(
        PaymentErrorCode.PAYMENT_DECLINED,
        'Lượt thanh toán trước thất bại, tạo lượt mới với Idempotency-Key mới',
        402,
        { paymentId: existing.id, orderId: existing.orderId, retryable: false },
      );
    }

    const order = await this.orders.findOrderForUser(existing.orderId, input.userId);
    if (!order) {
      throw new PaymentError(
        PaymentErrorCode.ORDER_NOT_FOUND,
        'Không tìm thấy đơn hàng của bạn',
        404,
      );
    }
    if (isPaidOrderStatus(order.status)) {
      throw new PaymentError(
        PaymentErrorCode.ORDER_ALREADY_PAID,
        'Đơn hàng đã được thanh toán',
        409,
        { paymentId: existing.id, orderId: existing.orderId },
      );
    }
    if (order.status !== OrderStatus.PENDING) {
      await this.markPaymentFailedIfPending(existing.id);
      throw new PaymentError(
        PaymentErrorCode.ORDER_NOT_PAYABLE,
        `Đơn hàng ở trạng thái ${order.status} không thể thanh toán`,
        409,
        { paymentId: existing.id, orderId: existing.orderId },
      );
    }

    return this.ensureCheckoutSession(existing, order, true);
  }

  private async ensureCheckoutSession(
    payment: Payment,
    order: PayableOrder,
    idempotentReplay: boolean,
  ): Promise<CreateCheckoutResult> {
    if (payment.stripeSessionId && payment.stripeCheckoutUrl) {
      const expiresAt = payment.stripeSessionExpiresAt?.getTime() ?? 0;
      if (expiresAt > Date.now()) {
        return this.toCheckoutResult(payment, idempotentReplay);
      }

      let session: Stripe.Checkout.Session;
      try {
        session = await this.stripe.checkout.sessions.retrieve(payment.stripeSessionId);
      } catch (error) {
        if (isPermanentStripeError(error)) {
          await this.markPaymentFailedIfPending(payment.id);
          throw this.sessionFailedError(payment.id, false);
        }
        throw this.sessionFailedError(payment.id, true);
      }

      if (session.status === 'open') {
        const refreshed = await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            stripeCheckoutUrl: session.url ?? payment.stripeCheckoutUrl,
            stripeSessionExpiresAt: session.expires_at
              ? new Date(session.expires_at * 1000)
              : payment.stripeSessionExpiresAt,
          },
        });
        return this.toCheckoutResult(refreshed, idempotentReplay);
      }

      if (session.status === 'complete' && session.payment_status === 'paid') {
        const settled = await this.settlePaidSession(session);
        throw new PaymentError(
          PaymentErrorCode.ORDER_ALREADY_PAID,
          'Đơn hàng đã được thanh toán',
          409,
          { paymentId: payment.id, orderId: settled.orderId },
        );
      }

      await this.markPaymentFailedIfPending(payment.id);
      throw new PaymentError(
        PaymentErrorCode.STRIPE_SESSION_EXPIRED,
        'Phiên thanh toán đã hết hạn, vui lòng tạo lượt thanh toán mới',
        409,
        { paymentId: payment.id, orderId: payment.orderId, retryable: true },
      );
    }

    const session = await this.createStripeCheckoutSession(payment, order);
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        stripeSessionId: session.id,
        stripeCheckoutUrl: session.url,
        stripeSessionExpiresAt: new Date(session.expires_at * 1000),
      },
    });

    return this.toCheckoutResult(updated, idempotentReplay);
  }

  private async createStripeCheckoutSession(
    payment: Payment,
    order: PayableOrder,
  ): Promise<Stripe.Checkout.Session> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const expiresAt = Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_TTL_SECONDS;

    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe.checkout.sessions.create(
        {
          mode: 'payment',
          line_items: [
            {
              price_data: {
                currency: 'vnd',
                product_data: { name: `Order #${order.id}` },
                unit_amount: order.total,
              },
              quantity: 1,
            },
          ],
          success_url: `${frontendUrl}/orders/${order.id}/confirmed?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${frontendUrl}/checkout?status=cancelled`,
          expires_at: expiresAt,
          client_reference_id: String(order.id),
          metadata: {
            paymentId: String(payment.id),
            orderId: String(order.id),
            userId: String(order.userId),
          },
          payment_intent_data: {
            metadata: {
              paymentId: String(payment.id),
              orderId: String(order.id),
              userId: String(order.userId),
            },
          },
        },
        { idempotencyKey: `checkout:payment:${payment.id}` },
      );
    } catch (error) {
      const permanent = isPermanentStripeError(error);
      if (permanent) {
        await this.markPaymentFailedIfPending(payment.id);
      }
      this.logger.error(
        `stripe.checkout.create failed paymentId=${payment.id} permanent=${permanent}: ${
          (error as Error).message
        }`,
      );
      throw this.sessionFailedError(payment.id, !permanent);
    }

    if (!session.url) {
      await this.markPaymentFailedIfPending(payment.id);
      this.logger.error(`stripe.checkout.create missing url paymentId=${payment.id}`);
      throw this.sessionFailedError(payment.id, false);
    }

    return session;
  }

  // ============================================================
  // 2. WEBHOOK — Stripe gọi, chốt đơn
  // ============================================================
  async handleStripeWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<StripeWebhookResult> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new PaymentError(
        PaymentErrorCode.STRIPE_WEBHOOK_INVALID,
        'STRIPE_WEBHOOK_SECRET chưa cấu hình',
        500,
      );
    }
    if (!rawBody || !signature) {
      throw new PaymentError(
        PaymentErrorCode.STRIPE_WEBHOOK_INVALID,
        'Thiếu raw body hoặc chữ ký Stripe',
        400,
      );
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (error) {
      this.logger.warn(`stripe.webhook.invalid_signature: ${(error as Error).message}`);
      throw new PaymentError(
        PaymentErrorCode.STRIPE_WEBHOOK_INVALID,
        'Webhook signature không hợp lệ',
        400,
      );
    }

    switch (event.type) {
      case 'checkout.session.completed':
        return this.onCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
          event.type,
        );
      case 'checkout.session.async_payment_succeeded':
        return this.onCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
          event.type,
        );
      case 'checkout.session.async_payment_failed':
        return this.onCheckoutFailed(
          event.data.object as Stripe.Checkout.Session,
          event.type,
        );
      case 'checkout.session.expired':
        return this.onCheckoutExpired(
          event.data.object as Stripe.Checkout.Session,
          event.type,
        );
      default:
        return { received: true, type: event.type, ignored: 'unhandled-event-type' };
    }
  }

  private async onCheckoutCompleted(
    session: Stripe.Checkout.Session,
    eventType: string,
  ): Promise<StripeWebhookResult> {
    if (session.payment_status !== 'paid') {
      this.logger.log(
        `stripe.checkout.completed.awaiting_payment sessionId=${session.id} payment_status=${session.payment_status}`,
      );
      return { received: true, type: eventType, ignored: 'awaiting-async-payment' };
    }

    const { orderId, replay } = await this.settlePaidSession(session);
    this.logger.log(
      `stripe.payment.succeeded orderId=${orderId} sessionId=${session.id} replay=${replay}`,
    );
    return { received: true, type: eventType, orderId, replay };
  }

  private async settlePaidSession(
    session: Stripe.Checkout.Session,
  ): Promise<{ orderId: number; replay: boolean }> {
    const paymentId = Number(session.metadata?.paymentId);
    const metadataOrderId = Number(session.metadata?.orderId);
    if (!Number.isSafeInteger(paymentId) || paymentId <= 0 || !Number.isSafeInteger(metadataOrderId)) {
      throw new BadRequestException('Webhook thiếu metadata paymentId/orderId hợp lệ');
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) {
        throw new PaymentError(
          PaymentErrorCode.ORDER_NOT_FOUND,
          'Payment not found',
          404,
          { paymentId },
        );
      }
      if (payment.orderId !== metadataOrderId) {
        throw this.invalidWebhook('metadata orderId không khớp payment');
      }
      if (payment.stripeSessionId && payment.stripeSessionId !== session.id) {
        throw this.invalidWebhook('stripeSessionId không khớp payment');
      }
      if (session.amount_total === null || session.amount_total !== payment.amount) {
        throw this.invalidWebhook(
          `amount_total=${session.amount_total} không khớp payment.amount=${payment.amount}`,
        );
      }
      if (session.currency && session.currency !== 'vnd') {
        throw this.invalidWebhook(`currency=${session.currency} không hợp lệ`);
      }

      const intentId = paymentIntentId(session);
      const update = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: PaymentStatus.SUCCEEDED } },
        data: {
          status: PaymentStatus.SUCCEEDED,
          transactionId: intentId ?? session.id,
          stripePaymentIntentId: intentId,
          stripeSessionId: payment.stripeSessionId ?? session.id,
          paidAt: new Date(),
        },
      });
      const replay = update.count === 0;

      const order = await tx.order.findUnique({
        where: { id: payment.orderId },
        select: { id: true, userId: true, status: true, total: true },
      });
      if (!order) {
        throw new PaymentError(
          PaymentErrorCode.ORDER_NOT_FOUND,
          'Không tìm thấy đơn hàng',
          404,
          { orderId: payment.orderId },
        );
      }

      let becamePaid = false;
      if (!isPaidOrderStatus(order.status)) {
        if (order.status === OrderStatus.PAYMENT_FAILED) {
          await this.orders.markPending(order.id, tx);
        } else if (order.status !== OrderStatus.PENDING) {
          this.logger.error(
            `stripe.payment.order_cannot_be_fulfilled orderId=${order.id} paymentId=${payment.id} status=${order.status} sessionId=${session.id} — REFUND REQUIRED`,
          );
          return { orderId: order.id, replay };
        }
        await this.orders.markPaid(order.id, payment.id, tx);
        becamePaid = true;
      }

      if (becamePaid) {
        await this.rewards.finalizeRewardsOnPaid(
          { orderId: order.id, userId: order.userId, totalPaid: order.total },
          tx,
        );
      }

      return { orderId: order.id, replay };
    });
  }

  private async onCheckoutExpired(
    session: Stripe.Checkout.Session,
    eventType: string,
  ): Promise<StripeWebhookResult> {
    return this.failPendingPayment(session, eventType);
  }

  private async onCheckoutFailed(
    session: Stripe.Checkout.Session,
    eventType: string,
  ): Promise<StripeWebhookResult> {
    return this.failPendingPayment(session, eventType);
  }

  private async failPendingPayment(
    session: Stripe.Checkout.Session,
    eventType: string,
  ): Promise<StripeWebhookResult> {
    const paymentId = Number(session.metadata?.paymentId);
    if (!Number.isSafeInteger(paymentId) || paymentId <= 0) {
      throw new BadRequestException('Webhook thiếu metadata paymentId hợp lệ');
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) {
        this.logger.warn(`stripe.webhook.payment_not_found paymentId=${paymentId} type=${eventType}`);
        return { received: true, type: eventType, ignored: 'payment-not-found' };
      }
      if (payment.stripeSessionId && payment.stripeSessionId !== session.id) {
        throw this.invalidWebhook('stripeSessionId không khớp payment');
      }

      const update = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      });
      if (update.count === 0) {
        return { received: true, type: eventType, ignored: 'not-pending' };
      }

      const order = await tx.order.findUnique({
        where: { id: payment.orderId },
        select: { id: true, status: true },
      });
      if (order?.status === OrderStatus.PENDING) {
        await this.orders.markPaymentFailed(order.id, payment.id, tx);
      }

      this.logger.log(
        `stripe.payment.failed orderId=${payment.orderId} paymentId=${payment.id} type=${eventType}`,
      );
      return { received: true, type: eventType, orderId: payment.orderId };
    });
  }

  private async markPaymentFailedIfPending(paymentId: number): Promise<void> {
    await this.prisma.payment.updateMany({
      where: { id: paymentId, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.FAILED },
    });
  }

  private sessionFailedError(paymentId: number, retryable: boolean): PaymentError {
    return new PaymentError(
      PaymentErrorCode.STRIPE_SESSION_FAILED,
      retryable
        ? 'Stripe tạm thời không phản hồi, vui lòng thử lại'
        : 'Không tạo được phiên thanh toán Stripe',
      502,
      { paymentId, retryable },
    );
  }

  private invalidWebhook(message: string): PaymentError {
    return new PaymentError(
      PaymentErrorCode.STRIPE_WEBHOOK_INVALID,
      `Webhook không hợp lệ: ${message}`,
      400,
    );
  }

  private assertPayable(order: PayableOrder): void {
    if (order.status === OrderStatus.PAID) {
      throw new PaymentError(
        PaymentErrorCode.ORDER_ALREADY_PAID,
        'Đơn hàng đã được thanh toán',
        409,
      );
    }
    if (
      order.status !== OrderStatus.PENDING &&
      order.status !== OrderStatus.PAYMENT_FAILED
    ) {
      throw new PaymentError(
        PaymentErrorCode.ORDER_NOT_PAYABLE,
        `Đơn hàng ở trạng thái ${order.status} không thể thanh toán`,
        409,
      );
    }
  }

  private toCheckoutResult(payment: Payment, idempotentReplay: boolean): CreateCheckoutResult {
    if (!payment.stripeCheckoutUrl) {
      throw this.sessionFailedError(payment.id, true);
    }
    return {
      orderId: payment.orderId,
      paymentId: payment.id,
      status: payment.status,
      checkoutUrl: payment.stripeCheckoutUrl,
      idempotentReplay,
    };
  }
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Payment } from '../generated/prisma/client.js';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { OrdersPaymentPort, PayableOrder } from './orders-payment.port.js';
import { PaymentError, PaymentErrorCode } from './payment.errors.js';
import type { PayInput } from './payment.types.js';
import { paymentRequestHash, PaymentsService } from './payments.service.js';
import { FakeStripe, stripeError } from '../../test/helpers/fake-stripe.js';

const WEBHOOK_SECRET = 'whsec_unit_test';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

type OrderRow = PayableOrder;

type PaymentCreateData = {
  orderId: number;
  idempotencyKey: string;
  requestHash: string;
  amount: number;
  method: 'WALLET' | 'CARD';
  status: PaymentStatus;
};

type PaymentWhere = {
  id?: number;
  idempotencyKey?: string;
  orderId?: number;
  status?: PaymentStatus | { not: PaymentStatus };
};

function matches(payment: Payment, where: PaymentWhere): boolean {
  if (where.id !== undefined && payment.id !== where.id) return false;
  if (where.idempotencyKey !== undefined && payment.idempotencyKey !== where.idempotencyKey) {
    return false;
  }
  if (where.orderId !== undefined && payment.orderId !== where.orderId) return false;
  if (where.status !== undefined) {
    if (typeof where.status === 'string') {
      if (payment.status !== where.status) return false;
    } else if (payment.status === where.status.not) {
      return false;
    }
  }
  return true;
}

function createPrismaMock(initialOrder: OrderRow) {
  const order: OrderRow = initialOrder;
  const payments: Payment[] = [];
  let nextPaymentId = 1;

  const paymentApi = {
    findUnique: vi.fn(async ({ where, include }: { where: PaymentWhere; include?: { order?: boolean } }) => {
      const found = payments.find((payment) =>
        where.id !== undefined
          ? payment.id === where.id
          : payment.idempotencyKey === where.idempotencyKey,
      );
      if (!found) return null;
      if (include?.order) {
        return {
          ...found,
          order: {
            id: found.orderId,
            userId: order.userId,
            status: order.status,
            pointsRedeemed: 0,
          },
        };
      }
      return found;
    }),
    findFirst: vi.fn(async ({ where }: { where: PaymentWhere }) => {
      return payments.find((payment) => matches(payment, where)) ?? null;
    }),
    create: vi.fn(async ({ data }: { data: PaymentCreateData }): Promise<Payment> => {
      if (payments.some((payment) => payment.idempotencyKey === data.idempotencyKey)) {
        throw Object.assign(new Error('unique idempotency key'), { code: 'P2002' });
      }
      if (
        data.status === PaymentStatus.PENDING &&
        payments.some(
          (payment) =>
            payment.orderId === data.orderId && payment.status === PaymentStatus.PENDING,
        )
      ) {
        throw Object.assign(new Error('unique pending payment'), { code: 'P2002' });
      }
      const now = new Date();
      const payment: Payment = {
        id: nextPaymentId++,
        transactionId: null,
        createdAt: now,
        updatedAt: now,
        stripeSessionId: null,
        stripePaymentIntentId: null,
        stripeCheckoutUrl: null,
        stripeSessionExpiresAt: null,
        paidAt: null,
        ...data,
      };
      payments.push(payment);
      return payment;
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: number }; data: Partial<Payment> }) => {
        const payment = payments.find((item) => item.id === where.id);
        if (!payment) throw new Error('payment not found');
        Object.assign(payment, data, { updatedAt: new Date() });
        return payment;
      },
    ),
    updateMany: vi.fn(
      async ({ where, data }: { where: PaymentWhere; data: Partial<Payment> }) => {
        const matched = payments.filter((payment) => matches(payment, where));
        for (const payment of matched) {
          Object.assign(payment, data, { updatedAt: new Date() });
        }
        return { count: matched.length };
      },
    ),
  };

  const orderApi = {
    findFirst: vi.fn(async () => order),
    findUnique: vi.fn(async () => order),
    updateMany: vi.fn(async ({ data }: { data?: Partial<OrderRow> }) => {
      if (data) Object.assign(order, data);
      return { count: 1 };
    }),
  };

  const refundApi = {
    upsert: vi.fn(async ({ create }: { create: unknown }) => create),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
  };

  const tx = {
    $queryRaw: vi.fn(async () => [{ id: order.id }]),
    payment: paymentApi,
    order: orderApi,
    refund: refundApi,
  };

  const prisma = {
    payment: paymentApi,
    order: orderApi,
    refund: refundApi,
    $transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
    __payments: payments,
    __order: order,
  };

  return { prisma, order, payments, tx };
}

function createOrdersPort(order: OrderRow): OrdersPaymentPort {
  return {
    findOrderForUser: vi.fn(async () => order),
    markPending: vi.fn(async () => {
      order.status = OrderStatus.PENDING;
    }),
    markPaid: vi.fn(async () => {
      order.status = OrderStatus.PAID;
    }),
    markPaymentFailed: vi.fn(async () => {
      order.status = OrderStatus.PAYMENT_FAILED;
    }),
    markRefunded: vi.fn(async () => {
      order.status = OrderStatus.REFUNDED;
    }),
  };
}

function setup() {
  const order: OrderRow = {
    id: 10,
    userId: 1,
    status: OrderStatus.PENDING,
    total: 85_000,
  };
  const { prisma, payments } = createPrismaMock(order);
  const orders = {
    ...createOrdersPort(order),
    markRefunded: vi.fn(async () => {
      order.status = OrderStatus.REFUNDED;
    }),
  };
  const rewards = {
    finalizeRewardsOnPaid: vi.fn(async () => undefined),
    refundRewardsOnRefund: vi.fn(async () => undefined),
  };
  const stripe = new FakeStripe();
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    stripe as never,
    orders,
    rewards as never,
  );

  return { service, stripe, prisma, orders, rewards, order, payments };
}

async function createSession() {
  const context = setup();
  const result = await context.service.createCheckout(baseInput);
  const sessionId = context.payments[0].stripeSessionId!;
  return { ...context, result, sessionId };
}

const baseInput: PayInput = {
  userId: 1,
  orderId: 10,
  method: 'WALLET',
  idempotencyKey: 'idem-abc-123',
};

async function capture(promise: Promise<unknown>): Promise<PaymentError> {
  try {
    await promise;
  } catch (error) {
    return error as PaymentError;
  }
  throw new Error('Expected promise to reject');
}

function response(error: PaymentError): Record<string, unknown> {
  return error.getResponse() as Record<string, unknown>;
}

describe('PaymentsService createCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  it('tạo Stripe Checkout Session, lưu session và trả checkoutUrl', async () => {
    const { service, stripe, payments } = setup();

    const result = await service.createCheckout(baseInput);

    expect(result).toMatchObject({
      orderId: 10,
      status: PaymentStatus.PENDING,
      idempotentReplay: false,
    });
    expect(result.checkoutUrl).toContain('https://checkout.stripe.com');
    expect(payments).toHaveLength(1);
    expect(payments[0].stripeSessionId).toMatch(/^cs_test_/);
    expect(payments[0].stripeCheckoutUrl).toBe(result.checkoutUrl);

    expect(stripe.createCalls).toHaveLength(1);
    const params = stripe.createCalls[0].params;
    expect(params.mode).toBe('payment');
    expect(params.success_url).toContain('/orders/10/confirmed');
    expect(params.cancel_url).toContain('/checkout?status=cancelled');
    expect(params.metadata).toMatchObject({ orderId: '10', paymentId: '1', userId: '1' });
    expect(params.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000) + 30 * 60 - 5);
  });

  it('cùng Idempotency-Key -> replay cùng session, Stripe chỉ gọi 1 lần', async () => {
    const { service, stripe, payments } = setup();

    const first = await service.createCheckout(baseInput);
    const second = await service.createCheckout(baseInput);

    expect(second.paymentId).toBe(first.paymentId);
    expect(second.checkoutUrl).toBe(first.checkoutUrl);
    expect(second.idempotentReplay).toBe(true);
    expect(stripe.createCalls).toHaveLength(1);
    expect(payments).toHaveLength(1);
  });

  it('key khác cho cùng order -> reuse active payment, không tạo session thứ 2', async () => {
    const { service, stripe, payments } = setup();

    const first = await service.createCheckout(baseInput);
    const second = await service.createCheckout({
      ...baseInput,
      idempotencyKey: 'idem-other-key',
    });

    expect(second.paymentId).toBe(first.paymentId);
    expect(second.checkoutUrl).toBe(first.checkoutUrl);
    expect(second.idempotentReplay).toBe(true);
    expect(stripe.createCalls).toHaveLength(1);
    expect(payments).toHaveLength(1);
  });

  it('cùng key khác payload -> IDEMPOTENCY_KEY_REUSED', async () => {
    const { service } = setup();

    await service.createCheckout(baseInput);
    const error = await capture(
      service.createCheckout({ ...baseInput, method: 'CARD' }),
    );

    expect(error.code).toBe(PaymentErrorCode.IDEMPOTENCY_KEY_REUSED);
  });

  it('order đã PAID -> ORDER_ALREADY_PAID, không gọi Stripe', async () => {
    const { service, stripe, order } = setup();
    order.status = OrderStatus.PAID;

    const error = await capture(service.createCheckout(baseInput));

    expect(error.code).toBe(PaymentErrorCode.ORDER_ALREADY_PAID);
    expect(stripe.createCalls).toHaveLength(0);
  });

  it('order PAYMENT_FAILED -> reset PENDING trước khi tạo session', async () => {
    const { service, orders, order } = setup();
    order.status = OrderStatus.PAYMENT_FAILED;

    await service.createCheckout(baseInput);

    expect(orders.markPending).toHaveBeenCalledWith(10, expect.anything());
    expect(order.status).toBe(OrderStatus.PENDING);
  });

  it('lỗi Stripe permanent -> payment FAILED, retryable=false', async () => {
    const { service, stripe, payments } = setup();
    stripe.failNextCreate = stripeError('StripeInvalidRequestError');

    const error = await capture(service.createCheckout(baseInput));

    expect(error.code).toBe(PaymentErrorCode.STRIPE_SESSION_FAILED);
    expect(response(error).retryable).toBe(false);
    expect(payments[0].status).toBe(PaymentStatus.FAILED);
  });

  it('lỗi Stripe transient -> giữ PENDING, retry cùng key thành công', async () => {
    const { service, stripe, payments } = setup();
    stripe.failNextCreate = stripeError('StripeAPIError');

    const firstError = await capture(service.createCheckout(baseInput));
    expect(firstError.code).toBe(PaymentErrorCode.STRIPE_SESSION_FAILED);
    expect(response(firstError).retryable).toBe(true);
    expect(payments[0].status).toBe(PaymentStatus.PENDING);

    const retried = await service.createCheckout(baseInput);

    expect(retried.checkoutUrl).toContain('https://checkout.stripe.com');
    expect(payments[0].status).toBe(PaymentStatus.PENDING);
    expect(payments[0].stripeSessionId).toBeTruthy();
    expect(stripe.createCalls).toHaveLength(2);
    expect(stripe.createCalls[0].options?.idempotencyKey).toBe(
      stripe.createCalls[1].options?.idempotencyKey,
    );
  });

  it('payment PENDING có session hết hạn -> STRIPE_SESSION_EXPIRED và mark FAILED', async () => {
    const { service, stripe, payments } = setup();
    const first = await service.createCheckout(baseInput);
    const sessionId = payments[0].stripeSessionId!;
    payments[0].stripeSessionExpiresAt = new Date(Date.now() - 1000);
    stripe.markExpired(sessionId);

    const error = await capture(service.createCheckout(baseInput));

    expect(error.code).toBe(PaymentErrorCode.STRIPE_SESSION_EXPIRED);
    expect(payments[0].status).toBe(PaymentStatus.FAILED);
    expect(first.checkoutUrl).toContain('https://checkout.stripe.com');
  });
});

describe('PaymentsService stripe webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  it('completed + paid -> payment SUCCEEDED, order PAID, rewards 1 lần', async () => {
    const { service, stripe, payments, order, rewards, sessionId } = await createSession();
    const session = stripe.markPaid(sessionId);
    const { payload, header } = stripe.signedEvent(
      session,
      'checkout.session.completed',
      WEBHOOK_SECRET,
    );

    const result = await service.handleStripeWebhook(Buffer.from(payload), header);

    expect(result).toMatchObject({ received: true, orderId: 10, replay: false });
    expect(payments[0].status).toBe(PaymentStatus.SUCCEEDED);
    expect(payments[0].paidAt).toBeInstanceOf(Date);
    expect(payments[0].stripePaymentIntentId).toMatch(/^pi_test_/);
    expect(order.status).toBe(OrderStatus.PAID);
    expect(rewards.finalizeRewardsOnPaid).toHaveBeenCalledTimes(1);
  });

  it('webhook lặp lại -> replay, không cộng điểm lần 2', async () => {
    const { service, stripe, rewards, sessionId } = await createSession();
    const session = stripe.markPaid(sessionId);
    const { payload, header } = stripe.signedEvent(
      session,
      'checkout.session.completed',
      WEBHOOK_SECRET,
    );

    await service.handleStripeWebhook(Buffer.from(payload), header);
    const replay = await service.handleStripeWebhook(Buffer.from(payload), header);

    expect(replay).toMatchObject({ received: true, orderId: 10, replay: true });
    expect(rewards.finalizeRewardsOnPaid).toHaveBeenCalledTimes(1);
  });

  it('completed nhưng unpaid -> ignored, chưa chốt đơn', async () => {
    const { service, stripe, payments, order, sessionId } = await createSession();
    const session = stripe.getSession(sessionId);
    const { payload, header } = stripe.signedEvent(
      session,
      'checkout.session.completed',
      WEBHOOK_SECRET,
    );

    const result = await service.handleStripeWebhook(Buffer.from(payload), header);

    expect(result).toMatchObject({ ignored: 'awaiting-async-payment' });
    expect(payments[0].status).toBe(PaymentStatus.PENDING);
    expect(order.status).toBe(OrderStatus.PENDING);
  });

  it('async_payment_succeeded -> chốt đơn PAID', async () => {
    const { service, stripe, order, sessionId } = await createSession();
    const session = stripe.markPaid(sessionId);
    const { payload, header } = stripe.signedEvent(
      session,
      'checkout.session.async_payment_succeeded',
      WEBHOOK_SECRET,
    );

    await service.handleStripeWebhook(Buffer.from(payload), header);

    expect(order.status).toBe(OrderStatus.PAID);
  });

  it('expired -> payment FAILED, order PAYMENT_FAILED', async () => {
    const { service, stripe, payments, order, sessionId } = await createSession();
    const session = stripe.markExpired(sessionId);
    const { payload, header } = stripe.signedEvent(
      session,
      'checkout.session.expired',
      WEBHOOK_SECRET,
    );

    await service.handleStripeWebhook(Buffer.from(payload), header);

    expect(payments[0].status).toBe(PaymentStatus.FAILED);
    expect(order.status).toBe(OrderStatus.PAYMENT_FAILED);
  });

  it('async_payment_failed -> payment FAILED', async () => {
    const { service, stripe, payments, sessionId } = await createSession();
    const session = stripe.updateSession(sessionId, {
      status: 'complete',
      payment_status: 'unpaid',
    });
    const { payload, header } = stripe.signedEvent(
      session,
      'checkout.session.async_payment_failed',
      WEBHOOK_SECRET,
    );

    await service.handleStripeWebhook(Buffer.from(payload), header);

    expect(payments[0].status).toBe(PaymentStatus.FAILED);
  });

  it('chữ ký sai -> STRIPE_WEBHOOK_INVALID', async () => {
    const { service, stripe, sessionId } = await createSession();
    const session = stripe.markPaid(sessionId);
    const { payload } = stripe.signedEvent(
      session,
      'checkout.session.completed',
      WEBHOOK_SECRET,
    );

    const error = await capture(service.handleStripeWebhook(Buffer.from(payload), 'bad'));

    expect(error.code).toBe(PaymentErrorCode.STRIPE_WEBHOOK_INVALID);
  });

  it('session id không khớp payment -> webhook invalid', async () => {
    const { service, stripe, sessionId } = await createSession();
    const session = stripe.markPaid(sessionId);
    const forged = { ...session, id: 'cs_test_other' } as typeof session;
    const { payload, header } = stripe.signedEvent(
      forged,
      'checkout.session.completed',
      WEBHOOK_SECRET,
    );

    const error = await capture(service.handleStripeWebhook(Buffer.from(payload), header));

    expect(error.code).toBe(PaymentErrorCode.STRIPE_WEBHOOK_INVALID);
  });

  it('sai amount_total -> webhook invalid', async () => {
    const { service, stripe, sessionId } = await createSession();
    const session = stripe.markPaid(sessionId);
    const forged = { ...session, amount_total: 1 } as typeof session;
    const { payload, header } = stripe.signedEvent(
      forged,
      'checkout.session.completed',
      WEBHOOK_SECRET,
    );

    const error = await capture(service.handleStripeWebhook(Buffer.from(payload), header));

    expect(error.code).toBe(PaymentErrorCode.STRIPE_WEBHOOK_INVALID);
  });
});

describe('PaymentsService refund & dispute webhook', () => {
  it('charge.refunded thành công -> Payment REFUNDED, Order REFUNDED, hoàn/thu hồi loyalty', async () => {
    const { service, stripe, orders, rewards, payments, sessionId } = await createSession();
    const session = stripe.markPaid(sessionId);
    const { payload: payPayload, header: payHeader } = stripe.signedEvent(
      session,
      'checkout.session.completed',
      WEBHOOK_SECRET,
    );
    await service.handleStripeWebhook(Buffer.from(payPayload), payHeader);
    expect(payments[0].status).toBe(PaymentStatus.SUCCEEDED);

    const charge = {
      id: 'ch_test_refund_1',
      payment_intent: payments[0].stripePaymentIntentId,
      refunded: true,
      amount: 85_000,
      amount_refunded: 85_000,
      currency: 'vnd',
      refunds: {
        data: [{ id: 're_test_1', amount: 85_000, status: 'succeeded', reason: 'requested_by_customer' }],
      },
    };
    const { payload, header } = stripe.signedEvent(charge, 'charge.refunded', WEBHOOK_SECRET);

    const result = await service.handleStripeWebhook(Buffer.from(payload), header);

    expect(result.received).toBe(true);
    expect(result.replay).toBe(false);
    expect(payments[0].status).toBe(PaymentStatus.REFUNDED);
    expect(rewards.refundRewardsOnRefund).toHaveBeenCalledTimes(1);
    expect(orders.markRefunded).toHaveBeenCalledWith(10, payments[0].id, expect.anything());
  });

  it('charge.refunded lặp lại -> replay=true, không trừ điểm lần 2', async () => {
    const { service, stripe, rewards, payments, sessionId } = await createSession();
    const session = stripe.markPaid(sessionId);
    const { payload: payPayload, header: payHeader } = stripe.signedEvent(
      session,
      'checkout.session.completed',
      WEBHOOK_SECRET,
    );
    await service.handleStripeWebhook(Buffer.from(payPayload), payHeader);

    const charge = {
      id: 'ch_test_refund_dup',
      payment_intent: payments[0].stripePaymentIntentId,
      refunded: true,
      amount: 85_000,
      amount_refunded: 85_000,
      currency: 'vnd',
      refunds: { data: [{ id: 're_test_dup', amount: 85_000, status: 'succeeded' }] },
    };
    const { payload, header } = stripe.signedEvent(charge, 'charge.refunded', WEBHOOK_SECRET);

    await service.handleStripeWebhook(Buffer.from(payload), header);
    expect(rewards.refundRewardsOnRefund).toHaveBeenCalledTimes(1);

    const secondResult = await service.handleStripeWebhook(Buffer.from(payload), header);
    expect(secondResult.received).toBe(true);
    expect(secondResult.replay).toBe(true);
    expect(rewards.refundRewardsOnRefund).toHaveBeenCalledTimes(1);
  });

  it('charge.refunded partial refund -> bỏ qua và log alert', async () => {
    const { service, stripe, rewards, payments, sessionId } = await createSession();
    const session = stripe.markPaid(sessionId);
    const { payload: payPayload, header: payHeader } = stripe.signedEvent(
      session,
      'checkout.session.completed',
      WEBHOOK_SECRET,
    );
    await service.handleStripeWebhook(Buffer.from(payPayload), payHeader);

    const charge = {
      id: 'ch_test_refund_part',
      payment_intent: payments[0].stripePaymentIntentId,
      refunded: false,
      amount: 85_000,
      amount_refunded: 40_000,
      currency: 'vnd',
      refunds: { data: [{ id: 're_test_part', amount: 40_000, status: 'succeeded' }] },
    };
    const { payload, header } = stripe.signedEvent(charge, 'charge.refunded', WEBHOOK_SECRET);

    const result = await service.handleStripeWebhook(Buffer.from(payload), header);
    expect(result.ignored).toBe('partial-refund-not-supported');
    expect(rewards.refundRewardsOnRefund).not.toHaveBeenCalled();
    expect(payments[0].status).toBe(PaymentStatus.SUCCEEDED);
  });

  it('charge.dispute.created -> log và trả manual review required', async () => {
    const { service, stripe, payments, sessionId } = await createSession();
    const session = stripe.markPaid(sessionId);
    const { payload: payPayload, header: payHeader } = stripe.signedEvent(
      session,
      'checkout.session.completed',
      WEBHOOK_SECRET,
    );
    await service.handleStripeWebhook(Buffer.from(payPayload), payHeader);

    const dispute = {
      id: 'dp_test_1',
      payment_intent: payments[0].stripePaymentIntentId,
      status: 'needs_response',
      amount: 85_000,
    };
    const { payload, header } = stripe.signedEvent(dispute, 'charge.dispute.created', WEBHOOK_SECRET);

    const result = await service.handleStripeWebhook(Buffer.from(payload), header);
    expect(result.ignored).toBe('dispute-requires-manual-review');
  });

  it('bỏ qua refund khi feature flag ENABLE_STRIPE_REFUND=false', async () => {
    process.env.ENABLE_STRIPE_REFUND = 'false';
    const { service, stripe, rewards, payments, sessionId } = await createSession();
    const session = stripe.markPaid(sessionId);
    const { payload: payPayload, header: payHeader } = stripe.signedEvent(
      session,
      'checkout.session.completed',
      WEBHOOK_SECRET,
    );
    await service.handleStripeWebhook(Buffer.from(payPayload), payHeader);

    const charge = {
      id: 'ch_test_refund_flag',
      payment_intent: payments[0].stripePaymentIntentId,
      refunded: true,
      amount: 85_000,
      amount_refunded: 85_000,
      currency: 'vnd',
    };
    const { payload, header } = stripe.signedEvent(charge, 'charge.refunded', WEBHOOK_SECRET);

    const result = await service.handleStripeWebhook(Buffer.from(payload), header);
    expect(result.ignored).toBe('refund-feature-flag-disabled');
    expect(rewards.refundRewardsOnRefund).not.toHaveBeenCalled();
    delete process.env.ENABLE_STRIPE_REFUND;
  });
});

describe('paymentRequestHash', () => {
  it('thay đổi khi user/order/method thay đổi', () => {
    const base = paymentRequestHash({ userId: 1, orderId: 2, method: 'WALLET' });
    expect(paymentRequestHash({ userId: 2, orderId: 2, method: 'WALLET' })).not.toBe(base);
    expect(paymentRequestHash({ userId: 1, orderId: 3, method: 'WALLET' })).not.toBe(base);
    expect(paymentRequestHash({ userId: 1, orderId: 2, method: 'CARD' })).not.toBe(base);
  });
});

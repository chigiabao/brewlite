import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PaymentError } from '../src/payments/payment.errors.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { STRIPE_CLIENT } from '../src/payments/stripe.provider.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FakeStripe, stripeError } from './helpers/fake-stripe.js';

const USER_ID = 2;
const WEBHOOK_SECRET = 'whsec_integration_test';

type PayInput = {
  userId: number;
  orderId: number;
  method: 'WALLET' | 'CARD';
  idempotencyKey: string;
};

describe('Payments integration (real PostgreSQL, fake Stripe)', () => {
  let moduleRef: TestingModule;
  let service: PaymentsService;
  let stripe: FakeStripe;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    stripe = new FakeStripe();

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STRIPE_CLIENT)
      .useValue(stripe)
      .compile();
    await moduleRef.init();

    service = moduleRef.get(PaymentsService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    stripe.createCalls.length = 0;
    stripe.retrieveCalls.length = 0;
    const orders = await prisma.order.findMany({
      where: { userId: USER_ID },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);

    if (orderIds.length > 0) {
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.loyaltyEntry.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }

    await prisma.user.upsert({
      where: { id: USER_ID },
      update: { loyaltyPoints: 0 },
      create: {
        id: USER_ID,
        email: 'fixture-int@brewlite.test',
        passwordHash: 'fixture',
      },
    });
  });

  function seedOrder(total = 50_000) {
    return prisma.order.create({ data: { userId: USER_ID, total } });
  }

  function input(orderId: number, idempotencyKey: string): PayInput {
    return { userId: USER_ID, orderId, method: 'WALLET', idempotencyKey };
  }

  async function capture(promise: Promise<unknown>): Promise<PaymentError> {
    try {
      await promise;
    } catch (error) {
      return error as PaymentError;
    }
    throw new Error('Expected promise to reject');
  }

  it('gửi lặp tuần tự cùng key -> 1 payment, 1 Stripe session', async () => {
    const order = await seedOrder();
    const request = input(order.id, 'itest-sequential-1');

    const first = await service.createCheckout(request);
    const second = await service.createCheckout(request);

    expect(second.paymentId).toBe(first.paymentId);
    expect(second.checkoutUrl).toBe(first.checkoutUrl);
    expect(second.idempotentReplay).toBe(true);
    expect(
      await prisma.payment.count({
        where: { idempotencyKey: request.idempotencyKey },
      }),
    ).toBe(1);
    expect(stripe.createCalls).toHaveLength(1);
  });

  it('2 request đồng thời cùng key -> 1 payment, Stripe tối đa 1 session', async () => {
    const order = await seedOrder();
    const request = input(order.id, 'itest-concurrent-1');

    const results = await Promise.allSettled([
      service.createCheckout(request),
      service.createCheckout(request),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(
      await prisma.payment.count({
        where: { idempotencyKey: request.idempotencyKey },
      }),
    ).toBe(1);
    expect(stripe.createCalls).toHaveLength(1);
  });

  it('2 request đồng thời khác key -> 1 payment PENDING, cùng session', async () => {
    const order = await seedOrder();

    const results = await Promise.all([
      service.createCheckout(input(order.id, 'itest-concurrent-a')),
      service.createCheckout(input(order.id, 'itest-concurrent-b')),
    ]);

    expect(results[0].paymentId).toBe(results[1].paymentId);
    expect(results[0].checkoutUrl).toBe(results[1].checkoutUrl);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    expect(
      await prisma.payment.count({
        where: { orderId: order.id, status: 'PENDING' },
      }),
    ).toBe(1);
  });

  it('cùng key khác payload -> IDEMPOTENCY_KEY_REUSED', async () => {
    const order = await seedOrder();
    const idempotencyKey = 'itest-reuse-1';

    await service.createCheckout(input(order.id, idempotencyKey));

    const error = await capture(
      service.createCheckout({
        userId: USER_ID,
        orderId: order.id,
        method: 'CARD',
        idempotencyKey,
      }),
    );

    expect(error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('partial unique index chặn payment PENDING thứ 2 cùng order', async () => {
    const order = await seedOrder();
    await service.createCheckout(input(order.id, 'itest-unique-1'));

    await expect(
      prisma.payment.create({
        data: {
          orderId: order.id,
          idempotencyKey: 'itest-unique-2',
          requestHash: 'x',
          amount: order.total,
          method: 'WALLET',
          status: 'PENDING',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('Stripe transient failure -> giữ PENDING, retry cùng key thành công', async () => {
    const order = await seedOrder();
    const request = input(order.id, 'itest-transient-1');
    stripe.failNextCreate = stripeError('StripeAPIError');

    const error = await capture(service.createCheckout(request));

    expect(error.code).toBe('STRIPE_SESSION_FAILED');
    expect((error.getResponse() as { retryable?: boolean }).retryable).toBe(true);
    const pending = await prisma.payment.findUnique({
      where: { idempotencyKey: request.idempotencyKey },
    });
    expect(pending?.status).toBe('PENDING');
    expect(pending?.stripeSessionId).toBeNull();

    const retried = await service.createCheckout(request);

    expect(retried.checkoutUrl).toContain('https://checkout.stripe.com');
    const recovered = await prisma.payment.findUnique({
      where: { idempotencyKey: request.idempotencyKey },
    });
    expect(recovered?.status).toBe('PENDING');
    expect(recovered?.stripeSessionId).toBeTruthy();
  });

  it('session hết hạn + key mới -> tạo attempt mới, 2 payment', async () => {
    const order = await seedOrder();
    const first = await service.createCheckout(input(order.id, 'itest-expired-1'));
    const payment = await prisma.payment.findUnique({
      where: { id: first.paymentId },
    });
    stripe.markExpired(payment!.stripeSessionId!);
    await prisma.payment.update({
      where: { id: first.paymentId },
      data: { stripeSessionExpiresAt: new Date(Date.now() - 1000) },
    });

    const second = await service.createCheckout(input(order.id, 'itest-expired-2'));

    expect(second.paymentId).not.toBe(first.paymentId);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(2);
    expect(
      (
        await prisma.payment.findUnique({ where: { id: first.paymentId } })
      )?.status,
    ).toBe('FAILED');
    expect(
      (
        await prisma.payment.findUnique({ where: { id: second.paymentId } })
      )?.status,
    ).toBe('PENDING');
  });

  it('webhook concurrent lặp lại -> chỉ settle 1 lần, 1 loyalty EARN', async () => {
    const order = await seedOrder();
    const checkout = await service.createCheckout(input(order.id, 'itest-webhook-1'));
    const payment = await prisma.payment.findUnique({
      where: { id: checkout.paymentId },
    });
    const session = stripe.markPaid(payment!.stripeSessionId!);
    const event = stripe.signedEvent(
      session,
      'checkout.session.completed',
      WEBHOOK_SECRET,
    );
    const raw = Buffer.from(event.payload);

    const [first, second] = await Promise.all([
      service.handleStripeWebhook(raw, event.header),
      service.handleStripeWebhook(raw, event.header),
    ]);

    expect([first.replay, second.replay].filter((replay) => replay === false)).toHaveLength(1);
    expect(
      (await prisma.order.findUnique({ where: { id: order.id } }))?.status,
    ).toBe('PAID');
    expect(
      await prisma.loyaltyEntry.count({
        where: { orderId: order.id, kind: 'EARN' },
      }),
    ).toBe(1);
  });

  it('webhook expired -> payment FAILED, order PAYMENT_FAILED', async () => {
    const order = await seedOrder();
    const checkout = await service.createCheckout(input(order.id, 'itest-webhook-exp-1'));
    const payment = await prisma.payment.findUnique({
      where: { id: checkout.paymentId },
    });
    const session = stripe.markExpired(payment!.stripeSessionId!);
    const event = stripe.signedEvent(
      session,
      'checkout.session.expired',
      WEBHOOK_SECRET,
    );

    await service.handleStripeWebhook(Buffer.from(event.payload), event.header);

    expect(
      (await prisma.order.findUnique({ where: { id: order.id } }))?.status,
    ).toBe('PAYMENT_FAILED');
    expect(
      (await prisma.payment.findUnique({ where: { id: payment!.id } }))?.status,
    ).toBe('FAILED');
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { STRIPE_CLIENT } from '../src/payments/stripe.provider.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FakeStripe } from './helpers/fake-stripe.js';

const USER_ID = 1;
const WEBHOOK_SECRET = 'whsec_e2e_test';

describe('Payments HTTP (e2e, fixture order, fake Stripe)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let stripe: FakeStripe;
  let token: string;

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    stripe = new FakeStripe();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STRIPE_CLIENT)
      .useValue(stripe)
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    token = await app.get(JwtService).signAsync({
      sub: USER_ID,
      email: 'fixture-e2e@brewlite.test',
    });
  });

  afterAll(async () => {
    await app.close();
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
      update: {},
      create: {
        id: USER_ID,
        email: 'fixture-e2e@brewlite.test',
        passwordHash: 'fixture',
      },
    });
  });

  function seedOrder(total = 85_000) {
    return prisma.order.create({ data: { userId: USER_ID, total } });
  }

  async function checkout(orderId: number, key: string, method = 'WALLET') {
    return request(app.getHttpServer())
      .post('/payments/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ orderId, method });
  }

  async function postWebhook(payload: string, header: string) {
    return request(app.getHttpServer())
      .post('/payments/webhook/stripe')
      .set('Stripe-Signature', header)
      .set('Content-Type', 'application/json')
      .send(payload);
  }

  it('thiếu Idempotency-Key -> 400 IDEMPOTENCY_KEY_REQUIRED, không tạo payment', async () => {
    const order = await seedOrder();

    const res = await request(app.getHttpServer())
      .post('/payments/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: order.id, method: 'WALLET' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('Idempotency-Key sai định dạng -> 400 INVALID_IDEMPOTENCY_KEY', async () => {
    const order = await seedOrder();

    const res = await checkout(order.id, 'has space');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_IDEMPOTENCY_KEY');
  });

  it('client gửi amount -> 400 validation, không tạo payment', async () => {
    const order = await seedOrder();

    const res = await request(app.getHttpServer())
      .post('/payments/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'e2e-amount-1')
      .send({ orderId: order.id, method: 'WALLET', amount: 1 });

    expect(res.status).toBe(400);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('order không thuộc user -> 404 ORDER_NOT_FOUND', async () => {
    const other = await prisma.user.upsert({
      where: { id: 999 },
      update: {},
      create: { id: 999, email: 'other-e2e@brewlite.test', passwordHash: 'fixture' },
    });
    const order = await prisma.order.create({
      data: { userId: other.id, total: 42_000 },
    });

    const res = await checkout(order.id, 'e2e-other-order-1');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ORDER_NOT_FOUND');

    await prisma.payment.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.user.delete({ where: { id: other.id } });
  });

  it('checkout thành công -> 200 PENDING + checkoutUrl, amount lấy từ Order', async () => {
    const order = await seedOrder();

    const res = await checkout(order.id, 'e2e-checkout-1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      orderId: order.id,
      status: 'PENDING',
      idempotentReplay: false,
    });
    expect(res.body.paymentId).toBeTypeOf('number');
    expect(res.body.checkoutUrl).toContain('https://checkout.stripe.com');

    const payment = await prisma.payment.findUnique({
      where: { idempotencyKey: 'e2e-checkout-1' },
    });
    expect(payment).toMatchObject({
      orderId: order.id,
      amount: 85_000,
      method: 'WALLET',
      status: 'PENDING',
    });
    expect(payment?.stripeSessionId).toBeTruthy();
    expect(payment?.stripeCheckoutUrl).toBe(res.body.checkoutUrl);

    const storedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(storedOrder?.status).toBe('PENDING');
  });

  it('replay cùng key -> cùng paymentId/session, idempotentReplay true', async () => {
    const order = await seedOrder();

    const first = await checkout(order.id, 'e2e-replay-1');
    const second = await checkout(order.id, 'e2e-replay-1');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.paymentId).toBe(first.body.paymentId);
    expect(second.body.checkoutUrl).toBe(first.body.checkoutUrl);
    expect(second.body.idempotentReplay).toBe(true);
    expect(
      await prisma.payment.count({ where: { idempotencyKey: 'e2e-replay-1' } }),
    ).toBe(1);
  });

  it('key khác trên cùng order -> reuse payment/session đang PENDING', async () => {
    const order = await seedOrder();

    const first = await checkout(order.id, 'e2e-active-1');
    const second = await checkout(order.id, 'e2e-active-2');

    expect(second.status).toBe(200);
    expect(second.body.paymentId).toBe(first.body.paymentId);
    expect(second.body.checkoutUrl).toBe(first.body.checkoutUrl);
    expect(second.body.idempotentReplay).toBe(true);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    expect(stripe.createCalls).toHaveLength(1);
  });

  it('cùng key khác payload -> 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const order = await seedOrder();

    await checkout(order.id, 'e2e-reuse-1', 'WALLET');
    const res = await checkout(order.id, 'e2e-reuse-1', 'CARD');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('2 request đồng thời khác key -> chỉ 1 payment PENDING, 1 session Stripe', async () => {
    const order = await seedOrder();

    const [a, b] = await Promise.all([
      checkout(order.id, 'e2e-concurrent-a'),
      checkout(order.id, 'e2e-concurrent-b'),
    ]);

    expect([a.status, b.status].every((status) => status === 200)).toBe(true);
    expect(a.body.paymentId).toBe(b.body.paymentId);
    expect(a.body.checkoutUrl).toBe(b.body.checkoutUrl);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    expect(
      await prisma.payment.count({
        where: { orderId: order.id, status: 'PENDING' },
      }),
    ).toBe(1);
  });

  it('webhook completed + paid -> order PAID, payment SUCCEEDED', async () => {
    const order = await seedOrder();
    const checkoutRes = await checkout(order.id, 'e2e-webhook-paid-1');
    const payment = await prisma.payment.findUnique({
      where: { id: checkoutRes.body.paymentId },
    });
    const session = stripe.markPaid(payment!.stripeSessionId!);
    const { payload, header } = stripe.signedEvent(
      session,
      'checkout.session.completed',
      WEBHOOK_SECRET,
    );

    const res = await postWebhook(payload, header);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      received: true,
      orderId: order.id,
      replay: false,
    });

    const storedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(storedOrder?.status).toBe('PAID');
    const storedPayment = await prisma.payment.findUnique({
      where: { id: payment!.id },
    });
    expect(storedPayment?.status).toBe('SUCCEEDED');
    expect(storedPayment?.paidAt).toBeInstanceOf(Date);
    expect(
      await prisma.loyaltyEntry.count({
        where: { orderId: order.id, kind: 'EARN' },
      }),
    ).toBe(1);
  });

  it('webhook lặp lại -> replay true, order vẫn PAID, không earn điểm lần 2', async () => {
    const order = await seedOrder();
    const checkoutRes = await checkout(order.id, 'e2e-webhook-replay-1');
    const payment = await prisma.payment.findUnique({
      where: { id: checkoutRes.body.paymentId },
    });
    const session = stripe.markPaid(payment!.stripeSessionId!);
    const event = stripe.signedEvent(
      session,
      'checkout.session.completed',
      WEBHOOK_SECRET,
    );

    const first = await postWebhook(event.payload, event.header);
    const second = await postWebhook(event.payload, event.header);

    expect(first.body.replay).toBe(false);
    expect(second.body.replay).toBe(true);
    expect(
      await prisma.loyaltyEntry.count({
        where: { orderId: order.id, kind: 'EARN' },
      }),
    ).toBe(1);
  });

  it('webhook completed nhưng unpaid -> 200 ignored, order vẫn PENDING', async () => {
    const order = await seedOrder();
    const checkoutRes = await checkout(order.id, 'e2e-webhook-unpaid-1');
    const payment = await prisma.payment.findUnique({
      where: { id: checkoutRes.body.paymentId },
    });
    const session = stripe.getSession(payment!.stripeSessionId!);
    const { payload, header } = stripe.signedEvent(
      session,
      'checkout.session.completed',
      WEBHOOK_SECRET,
    );

    const res = await postWebhook(payload, header);

    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe('awaiting-async-payment');
    expect(
      (await prisma.order.findUnique({ where: { id: order.id } }))?.status,
    ).toBe('PENDING');
  });

  it('webhook expired -> payment FAILED, order PAYMENT_FAILED', async () => {
    const order = await seedOrder();
    const checkoutRes = await checkout(order.id, 'e2e-webhook-expired-1');
    const payment = await prisma.payment.findUnique({
      where: { id: checkoutRes.body.paymentId },
    });
    const session = stripe.markExpired(payment!.stripeSessionId!);
    const { payload, header } = stripe.signedEvent(
      session,
      'checkout.session.expired',
      WEBHOOK_SECRET,
    );

    const res = await postWebhook(payload, header);

    expect(res.status).toBe(200);
    expect(
      (await prisma.order.findUnique({ where: { id: order.id } }))?.status,
    ).toBe('PAYMENT_FAILED');
    expect(
      (await prisma.payment.findUnique({ where: { id: payment!.id } }))?.status,
    ).toBe('FAILED');
  });

  it('webhook chữ ký sai -> 400 STRIPE_WEBHOOK_INVALID', async () => {
    const res = await postWebhook('{}', 't=1,v1=deadbeef');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('STRIPE_WEBHOOK_INVALID');
  });

  it('event không xử lý -> 200 ignored unhandled-event-type', async () => {
    const { payload, header } = {
      payload: JSON.stringify({
        id: 'evt_unknown',
        object: 'event',
        api_version: '2026-09-30.endive',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 1,
        request: { id: null, idempotency_key: null },
        type: 'charge.refunded',
        data: { object: {} },
      }),
      header: stripe.webhooks.generateTestHeaderString({
        payload: JSON.stringify({
          id: 'evt_unknown',
          object: 'event',
          api_version: '2026-09-30.endive',
          created: Math.floor(Date.now() / 1000),
          livemode: false,
          pending_webhooks: 1,
          request: { id: null, idempotency_key: null },
          type: 'charge.refunded',
          data: { object: {} },
        }),
        secret: WEBHOOK_SECRET,
      }),
    };

    const res = await postWebhook(payload, header);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, ignored: 'unhandled-event-type' });
  });
});

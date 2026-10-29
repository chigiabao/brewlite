import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { GATEWAY_REFERENCE_GENERATOR } from '../src/payments/mock-gateway.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

let nextReference = 'MOCK-OK1234';
const generator = { next: () => nextReference };

describe('POST /payments (e2e, fixture order)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GATEWAY_REFERENCE_GENERATOR)
      .useValue(generator)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    nextReference = 'MOCK-OK1234';
    const orders = await prisma.order.findMany({
      where: { userId: 1 },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length > 0) {
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.loyaltyEntry.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    } else {
      await prisma.order.deleteMany({ where: { userId: 1 } });
    }
    await prisma.user.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        email: 'fixture-e2e@brewlite.test',
        passwordHash: 'fixture',
      },
    });
  });

  function seedOrder(total = 85_000) {
    return prisma.order.create({ data: { userId: 1, total } });
  }

  it('thiếu Idempotency-Key -> 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
    const order = await seedOrder();

    const res = await request(app.getHttpServer())
      .post('/payments')
      .send({ orderId: order.id, method: 'WALLET' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(
      await prisma.payment.count({ where: { order: { userId: 1 } } }),
    ).toBe(0);
  });

  it('không nhận amount từ client -> 400, không tạo payment', async () => {
    const order = await seedOrder();

    const res = await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', 'e2e-amount-1')
      .send({ orderId: order.id, method: 'WALLET', amount: 1 });

    expect(res.status).toBe(400);
    expect(
      await prisma.payment.count({ where: { order: { userId: 1 } } }),
    ).toBe(0);
  });

  it('WALLET success -> 200, order PAID, amount lấy từ Order', async () => {
    const order = await seedOrder();

    const res = await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', 'e2e-wallet-1')
      .send({ orderId: order.id, method: 'WALLET' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      orderId: order.id,
      status: 'SUCCEEDED',
      orderStatus: 'PAID',
      method: 'WALLET',
      amount: 85_000,
      idempotentReplay: false,
    });
    expect(res.body.transactionId).toBe('MOCK-OK1234');

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe('PAID');
    expect(
      await prisma.payment.count({ where: { idempotencyKey: 'e2e-wallet-1' } }),
    ).toBe(1);
  });

  it('CARD success -> 200, method CARD', async () => {
    const order = await seedOrder();

    const res = await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', 'e2e-card-1')
      .send({ orderId: order.id, method: 'CARD' });

    expect(res.status).toBe(200);
    expect(res.body.method).toBe('CARD');
    expect(res.body.orderStatus).toBe('PAID');
  });

  it('gửi lặp cùng key -> cùng paymentId, idempotentReplay true, 1 payment', async () => {
    const order = await seedOrder();
    const key = 'e2e-replay-1';

    const first = await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', key)
      .send({ orderId: order.id, method: 'WALLET' });
    const second = await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', key)
      .send({ orderId: order.id, method: 'WALLET' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.paymentId).toBe(first.body.paymentId);
    expect(second.body.transactionId).toBe(first.body.transactionId);
    expect(second.body.idempotentReplay).toBe(true);
    expect(await prisma.payment.count({ where: { idempotencyKey: key } })).toBe(
      1,
    );
  });

  it('cùng key khác payload -> 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const order = await seedOrder();
    const key = 'e2e-reuse-1';

    await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', key)
      .send({ orderId: order.id, method: 'WALLET' });
    const res = await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', key)
      .send({ orderId: order.id, method: 'CARD' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('đơn đã PAID thanh toán lại -> 409 ORDER_ALREADY_PAID', async () => {
    const order = await seedOrder();

    // Lượt thanh toán đầu tiên thành công.
    const first = await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', 'e2e-paid-state-1')
      .send({ orderId: order.id, method: 'WALLET' });

    expect(first.status).toBe(200);
    expect(first.body.orderStatus).toBe('PAID');

    // Key mới để không rơi vào nhánh idempotency replay.
    const second = await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', 'e2e-paid-state-2')
      .send({ orderId: order.id, method: 'WALLET' });

    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({
      statusCode: 409,
      code: 'ORDER_ALREADY_PAID',
    });

    // Không tạo thêm payment.
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(
      1,
    );
  });

  it('gateway decline -> 402 PAYMENT_DECLINED, order PAYMENT_FAILED', async () => {
    const order = await seedOrder();
    nextReference = 'MOCK-DECL0000';

    const res = await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', 'e2e-decline-1')
      .send({ orderId: order.id, method: 'CARD' });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('PAYMENT_DECLINED');

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe('PAYMENT_FAILED');
  });

  it('decline -> 402, retry key mới -> 200, order PAID', async () => {
    const order = await seedOrder();
    nextReference = 'MOCK-DECL0000';

    const declined = await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', 'e2e-decline-retry-1')
      .send({ orderId: order.id, method: 'CARD' });
    expect(declined.status).toBe(402);

    nextReference = 'MOCK-OK5678';
    const retried = await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', 'e2e-decline-retry-2')
      .send({ orderId: order.id, method: 'WALLET' });

    expect(retried.status).toBe(200);
    expect(retried.body.orderStatus).toBe('PAID');

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe('PAID');
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(
      2,
    );
  });
});

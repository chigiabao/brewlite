import { INestApplication, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
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
  let fixtureToken: string;
  let fixtureUserId: number;
  const runId = randomUUID();
  const testKey = (suffix: string) => `f04-e2e-${runId}-${suffix}`;

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
    const user = await prisma.user.create({
      data: { email: `f04-pay-${runId}@example.test`, passwordHash: 'fixture-only' },
    });
    fixtureUserId = user.id;
    fixtureToken = app.get(JwtService).sign({ sub: fixtureUserId, email: user.email });
  });

  async function cleanFixtureOrders() {
    // Never delete orders belonging to seeded/real users (especially id=1).
    const orders = await prisma.order.findMany({
      where: { userId: fixtureUserId }, select: { id: true },
    });
    const ids = orders.map((o) => o.id);
    if (ids.length === 0) return;
    await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.loyaltyEntry.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }

  afterAll(async () => {
    try {
      if (prisma && fixtureUserId) {
        await cleanFixtureOrders();
        await prisma.user.delete({ where: { id: fixtureUserId } });
      }
    } finally {
      await app?.close();
    }
  });

  beforeEach(async () => {
    await cleanFixtureOrders();
  });

  function seedOrder(total = 85_000) {
    return prisma.order.create({ data: { userId: fixtureUserId, total } });
  }

  it('không có JWT -> 401, không tạo payment hay đổi trạng thái order', async () => {
    const order = await seedOrder();
    await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', testKey('e2e-no-jwt-1'))
      .send({ orderId: order.id, method: 'WALLET' })
      .expect(401);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('PENDING');
  });

  it('JWT có payload đúng nhưng chữ ký sai -> 401', async () => {
    const order = await seedOrder();
    const forged = app.get(JwtService).sign(
      { sub: fixtureUserId, email: 'fixture-e2e@brewlite.test' },
      { secret: 'fake-signing-key' },
    );
    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${forged}`)
      .set('Idempotency-Key', testKey('e2e-forged-jwt-1'))
      .send({ orderId: order.id, method: 'WALLET' })
      .expect(401);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('JWT user khác không được thanh toán đơn của fixture -> 404', async () => {
    const order = await seedOrder();
    const otherUserToken = app.get(JwtService).sign({
      sub: 999_999_999,
      email: 'other-e2e@brewlite.test',
    });
    const res = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${otherUserToken}`)
      .set('Idempotency-Key', testKey('e2e-other-user-1'))
      .send({ orderId: order.id, method: 'WALLET' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ORDER_NOT_FOUND');
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('thiếu Idempotency-Key -> 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
    const order = await seedOrder();

    const res = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${fixtureToken}`)
      .send({ orderId: order.id, method: 'WALLET' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(
      await prisma.payment.count({ where: { order: { userId: fixtureUserId } } }),
    ).toBe(0);
  });

  it('không nhận amount từ client -> 400, không tạo payment', async () => {
    const order = await seedOrder();

    const res = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${fixtureToken}`)
      .set('Idempotency-Key', testKey('e2e-amount-1'))
      .send({ orderId: order.id, method: 'WALLET', amount: 1 });

    expect(res.status).toBe(400);
    expect(
      await prisma.payment.count({ where: { order: { userId: fixtureUserId } } }),
    ).toBe(0);
  });

  it('WALLET success -> 200, order PAID, amount lấy từ Order', async () => {
    const order = await seedOrder();

    const res = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${fixtureToken}`)
      .set('Idempotency-Key', testKey('e2e-wallet-1'))
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
      await prisma.payment.count({ where: { idempotencyKey: testKey('e2e-wallet-1') } }),
    ).toBe(1);
  });

  it('CARD success -> 200, method CARD', async () => {
    const order = await seedOrder();

    const res = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${fixtureToken}`)
      .set('Idempotency-Key', testKey('e2e-card-1'))
      .send({ orderId: order.id, method: 'CARD' });

    expect(res.status).toBe(200);
    expect(res.body.method).toBe('CARD');
    expect(res.body.orderStatus).toBe('PAID');
  });

  it('gửi lặp cùng key -> cùng paymentId, idempotentReplay true, 1 payment', async () => {
    const order = await seedOrder();
    const key = testKey('e2e-replay-1');

    const first = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${fixtureToken}`)
      .set('Idempotency-Key', key)
      .send({ orderId: order.id, method: 'WALLET' });
    const second = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${fixtureToken}`)
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
    const key = testKey('e2e-reuse-1');

    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${fixtureToken}`)
      .set('Idempotency-Key', key)
      .send({ orderId: order.id, method: 'WALLET' });
    const res = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${fixtureToken}`)
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
      .set('Authorization', `Bearer ${fixtureToken}`)
      .set('Idempotency-Key', testKey('e2e-paid-state-1'))
      .send({ orderId: order.id, method: 'WALLET' });

    expect(first.status).toBe(200);
    expect(first.body.orderStatus).toBe('PAID');

    // Key mới để không rơi vào nhánh idempotency replay.
    const second = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${fixtureToken}`)
      .set('Idempotency-Key', testKey('e2e-paid-state-2'))
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

  it('demoDecline không bật trả 400, DB không tạo Payment', async () => {
    const previous = process.env.MOCK_GATEWAY_TEST_MODE;
    process.env.MOCK_GATEWAY_TEST_MODE = 'false';
    try {
      const order = await seedOrder();
      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${fixtureToken}`)
        .set('Idempotency-Key', testKey('e2e-demo-disabled-1'))
        .send({ orderId: order.id, method: 'CARD', demoDecline: true })
        .expect(400);
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
      expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('PENDING');
    } finally {
      if (previous === undefined) delete process.env.MOCK_GATEWAY_TEST_MODE;
      else process.env.MOCK_GATEWAY_TEST_MODE = previous;
    }
  });

  it('demo decline đi qua API thật: 402 -> PAYMENT_FAILED; retry key mới -> PAID', async () => {
    const previous = process.env.MOCK_GATEWAY_TEST_MODE;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.MOCK_GATEWAY_TEST_MODE = 'true';
    process.env.NODE_ENV = 'test';
    try {
      const order = await seedOrder();
      const declined = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${fixtureToken}`)
        .set('Idempotency-Key', testKey('e2e-demo-declined-1'))
        .send({ orderId: order.id, method: 'WALLET', demoDecline: true });
      expect(declined.status).toBe(402);
      expect(declined.body.code).toBe('PAYMENT_DECLINED');
      expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('PAYMENT_FAILED');
      const retry = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${fixtureToken}`)
        .set('Idempotency-Key', testKey('e2e-demo-retry-2'))
        .send({ orderId: order.id, method: 'WALLET' });
      expect(retry.status).toBe(200);
      expect(retry.body.orderStatus).toBe('PAID');
      expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(2);
    } finally {
      if (previous === undefined) delete process.env.MOCK_GATEWAY_TEST_MODE;
      else process.env.MOCK_GATEWAY_TEST_MODE = previous;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('gateway decline -> 402 PAYMENT_DECLINED, order PAYMENT_FAILED', async () => {
    const order = await seedOrder();
    nextReference = 'MOCK-DECL0000';

    const res = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${fixtureToken}`)
      .set('Idempotency-Key', testKey('e2e-decline-1'))
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
      .set('Authorization', `Bearer ${fixtureToken}`)
      .set('Idempotency-Key', testKey('e2e-decline-retry-1'))
      .send({ orderId: order.id, method: 'CARD' });
    expect(declined.status).toBe(402);

    nextReference = 'MOCK-OK5678';
    const retried = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${fixtureToken}`)
      .set('Idempotency-Key', testKey('e2e-decline-retry-2'))
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

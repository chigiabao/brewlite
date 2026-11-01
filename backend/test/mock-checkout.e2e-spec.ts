/**
 * FIX 11: Acceptance qua HTTP + PostgreSQL thật, cần DB TEST riêng.
 * Chạy: PAYMENT_PROVIDER=MOCK MOCK_GATEWAY_TEST_MODE=true npm run test:e2e
 */
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const id = randomUUID();
const key = (s: string) => `fix11-${id}-${s}`;

describe('FIX11: mock checkout HTTP E2E, DB thật', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userId: number;
  let token: string;
  let previousMode: string | undefined;
  let previousDemo: string | undefined;
  let previousJwt: string | undefined;

  beforeAll(async () => {
    previousMode = process.env.PAYMENT_PROVIDER;
    previousDemo = process.env.MOCK_GATEWAY_TEST_MODE;
    previousJwt = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'fix11-mock-e2e-local-test-secret-very-long';
    process.env.PAYMENT_PROVIDER = 'MOCK';
    process.env.MOCK_GATEWAY_TEST_MODE = 'true';
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const user = await prisma.user.create({ data: {
      email: `fix11-${id}@example.test`, passwordHash: 'not-an-account-for-login', loyaltyPoints: 0,
    } });
    userId = user.id;
    token = app.get(JwtService).sign({ sub: userId, email: user.email });
  });

  afterAll(async () => {
    if (prisma && userId) {
      const orders = await prisma.order.findMany({ where: { userId }, select: { id: true } });
      const ids = orders.map(o => o.id);
      if (ids.length) {
        await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
        await prisma.loyaltyEntry.deleteMany({ where: { orderId: { in: ids } } });
        await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
        await prisma.order.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.user.delete({ where: { id: userId } });
    }
    await app?.close();
    if (previousJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwt;
    if (previousMode === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = previousMode;
    if (previousDemo === undefined) delete process.env.MOCK_GATEWAY_TEST_MODE;
    else process.env.MOCK_GATEWAY_TEST_MODE = previousDemo;
  });

  async function newOrder() {
    return prisma.order.create({ data: { userId, total: 45000, subtotal: 45000 } });
  }
  function pay(orderId: number, suffix: string, demoDecline = false) {
    return request(app.getHttpServer()).post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key(suffix))
      .send({ orderId, method: 'WALLET', ...(demoDecline ? { demoDecline } : {}) });
  }

  it('401 nếu chưa có JWT, không tạo Payment', async () => {
    const order = await newOrder();
    await request(app.getHttpServer()).post('/payments')
      .set('Idempotency-Key', key('no-auth'))
      .send({ orderId: order.id, method: 'WALLET' }).expect(401);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('thành công + replay cùng key chỉ cộng 1 lần điểm', async () => {
    const order = await newOrder();
    const first = await pay(order.id, 'success').expect(200);
    expect(first.body).toMatchObject({ orderId: order.id, status: 'SUCCEEDED', orderStatus: 'PAID' });
    const replay = await pay(order.id, 'success').expect(200);
    expect(replay.body).toMatchObject({ status: 'SUCCEEDED', idempotentReplay: true });
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.loyaltyEntry.count({ where: { orderId: order.id, kind: 'EARN' } })).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PAID');
  });

  it('từ chối -> PAYMENT_FAILED, thử lại cùng order bằng key mới -> PAID', async () => {
    const order = await newOrder();
    const fail = await pay(order.id, 'decline', true).expect(200);
    expect(fail.body).toMatchObject({ status: 'FAILED', orderStatus: 'PAYMENT_FAILED' });
    expect(await prisma.loyaltyEntry.count({ where: { orderId: order.id } })).toBe(0);
    const success = await pay(order.id, 'retry').expect(200);
    expect(success.body).toMatchObject({ status: 'SUCCEEDED', orderStatus: 'PAID' });
    expect(await prisma.order.count({ where: { id: order.id } })).toBe(1);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(2);
  });
});

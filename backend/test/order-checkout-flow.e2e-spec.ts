/**
 * FIX04 — Real HTTP + PostgreSQL checkout acceptance tests.
 * Uses isolated users/products/coupons and cleans ONLY records created by this suite.
 * Run on an expendable local test database, never the team's production database.
 */
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const runId = randomUUID();
const testKey = (suffix: string) => `f04-flow-${runId}-${suffix}`;

const checkoutBody = (productId: number, qty = 1) => ({
  items: [{ productId, size: 'M', toppings: ['Kem'], qty }],
});

describe('FIX04: actual order -> payment -> rewards checkout (PostgreSQL E2E)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let orders: OrdersService;
  let userId: number;
  let otherUserId: number;
  let token: string;
  let otherToken: string;
  let productId: number;
  let couponCode: string | null = null;
  let previousJwtSecret: string | undefined;

  async function cleanupOrders() {
    const rows = await prisma.order.findMany({ where: { userId }, select: { id: true } });
    const ids = rows.map((order) => order.id);
    if (ids.length === 0) return;
    await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.loyaltyEntry.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    previousJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'fix04-actual-postgresql-e2e-jwt-secret';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true,
    }));
    await app.init();
    prisma = app.get(PrismaService);
    orders = app.get(OrdersService);

    const users = await Promise.all([
      prisma.user.create({ data: { email: `f04-a-${runId}@example.test`, passwordHash: 'test-only', loyaltyPoints: 5_000 } }),
      prisma.user.create({ data: { email: `f04-b-${runId}@example.test`, passwordHash: 'test-only' } }),
    ]);
    userId = users[0].id;
    otherUserId = users[1].id;
    const jwt = app.get(JwtService);
    token = jwt.sign({ sub: userId, email: users[0].email });
    otherToken = jwt.sign({ sub: otherUserId, email: users[1].email });
  });

  beforeEach(async () => {
    await prisma.user.update({ where: { id: userId }, data: { loyaltyPoints: 5_000 } });
    const product = await prisma.product.create({ data: {
      name: `FIX04 test product ${randomUUID()}`,
      price: 30_000,
      imageUrl: 'https://example.test/fix04.png',
      stock: 10,
      version: 0,
    } });
    productId = product.id;
  });

  afterEach(async () => {
    if (!prisma) return;
    await cleanupOrders();
    if (productId) await prisma.product.delete({ where: { id: productId } });
    productId = 0;
    if (couponCode) await prisma.coupon.delete({ where: { code: couponCode } });
    couponCode = null;
  });

  afterAll(async () => {
    try {
      if (prisma && userId) {
        await cleanupOrders();
        await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
      }
    } finally {
      await app?.close();
      if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousJwtSecret;
    }
  });

  it('creates a priced order and replays the order key without double stock', async () => {
    const placed = await request(app.getHttpServer())
      .post('/orders').set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', testKey('order-happy'))
      .send(checkoutBody(productId, 2)).expect(201);
    const orderId: number = placed.body.id;
    expect(placed.body).toMatchObject({ status: 'PENDING', subtotal: 80_000, total: 80_000 });

    const items = await prisma.orderItem.findMany({ where: { orderId } });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ productId, qty: 2, unitPrice: 40_000, lineTotal: 80_000 });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .toMatchObject({ stock: 8, version: 1 });

    const replay = await request(app.getHttpServer())
      .post('/orders').set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', testKey('order-happy'))
      .send(checkoutBody(productId, 2)).expect(201);
    expect(replay.body.id).toBe(orderId);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .toMatchObject({ stock: 8, version: 1 });
  });

  it('missing order idempotency key and tampered frontend price do not touch stock', async () => {
    await request(app.getHttpServer()).post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(checkoutBody(productId)).expect(400);
    await request(app.getHttpServer()).post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', testKey('tampered-total'))
      .send({ ...checkoutBody(productId), total: 1, unitPrice: 1 }).expect(400);
    expect(await prisma.order.count({ where: { userId } })).toBe(0);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .toMatchObject({ stock: 10, version: 0 });
  });

  it('same order key returns same order; changed payload gets 409; stock decremented once', async () => {
    const key = testKey('order-replay');
    const submit = (qty: number) => request(app.getHttpServer()).post('/orders')
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key)
      .send(checkoutBody(productId, qty));
    const first = await submit(1);
    const replay = await submit(1);
    const mismatch = await submit(2);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(mismatch.status).toBe(409);
    expect(await prisma.order.count({ where: { userId } })).toBe(1);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .toMatchObject({ stock: 9, version: 1 });
  });

  it('other JWT cannot read another user order', async () => {
    const placed = await request(app.getHttpServer()).post('/orders')
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', testKey('scope'))
      .send(checkoutBody(productId)).expect(201);
    const orderId: number = placed.body.id;

    await request(app.getHttpServer()).get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${otherToken}`).expect(404);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING');
  });

  async function createCouponOrder(suffix: string) {
    couponCode = `F04${randomUUID().replaceAll('-', '').slice(0, 17).toUpperCase()}`;
    await prisma.coupon.create({ data: {
      code: couponCode, discountPercent: 10, minOrderValue: 0,
      maxUses: 2, usedCount: 0, active: true,
      expiresAt: new Date(Date.now() + 86_400_000),
    } });
    const placed = await request(app.getHttpServer()).post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', testKey(suffix))
      .send({ items: [{ productId, size: 'S', toppings: [], qty: 1 }],
        couponCode: couponCode.toLowerCase(), pointsToRedeem: 3_000 });
    expect(placed.status).toBe(201);
    expect(placed.body).toMatchObject({ subtotal: 30_000, discountTotal: 6_000, pointsRedeemed: 3_000, total: 24_000 });
    return placed.body.id as number;
  }

  it('cancel releases stock, coupon quota and reserved points exactly once', async () => {
    const orderId = await createCouponOrder('rewards-cancel');
    expect(await prisma.coupon.findUniqueOrThrow({ where: { code: couponCode! } }))
      .toMatchObject({ usedCount: 1 });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
      .toMatchObject({ loyaltyPoints: 2_000 });
    await expect(orders.cancel(userId, orderId))
      .resolves.toEqual({ id: orderId, status: 'CANCELLED' });
    await expect(orders.cancel(userId, orderId)).rejects.toThrow();
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .toMatchObject({ stock: 10, version: 2 });
    expect(await prisma.coupon.findUniqueOrThrow({ where: { code: couponCode! } }))
      .toMatchObject({ usedCount: 0 });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
      .toMatchObject({ loyaltyPoints: 5_000 });
    expect(await prisma.loyaltyEntry.count({ where: { orderId, kind: 'EARN' } })).toBe(0);
  });

  it('cancel rolls back status and stock when reward release fails mid-transaction', async () => {
    const orderId = await createCouponOrder('rewards-rollback');
    // Corrupt quota on purpose to force releaseReservedOnCancel() to reject.
    // Order still references coupon; only reservation counter is modified.
    await prisma.coupon.update({ where: { code: couponCode! }, data: { usedCount: 0 } });
    await expect(orders.cancel(userId, orderId)).rejects.toThrow('COUPON_RESERVATION_NOT_FOUND');
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } }))
      .toMatchObject({ status: 'PENDING' });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .toMatchObject({ stock: 9, version: 1 });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
      .toMatchObject({ loyaltyPoints: 2_000 });
  });
});

import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { OrdersService } from '../src/orders/public.js';
import { MockGatewayService } from '../src/payments/mock-gateway.service.js';
import { MockOrdersPaymentAdapter } from '../src/payments/orders-payment.port.js';
import { GatewayTimeoutError, PaymentDeclinedError } from '../src/payments/payment.errors.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { RewardsService } from '../src/rewards/public.js';
import { createRewardsTestDatabase } from './helpers/rewards-test-database.js';

/** Real transactions, constraints and concurrent connections; no fake Prisma. */
describe.skipIf(!process.env.REWARDS_TEST_DATABASE_URL)('G-04 PostgreSQL quota/replay regression', () => {
  let database: Awaited<ReturnType<typeof createRewardsTestDatabase>>;
  let prisma: PrismaService;
  let rewards: RewardsService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let gateway: MockGatewayService;

  beforeAll(async () => {
    database = await createRewardsTestDatabase();
    prisma = database.prisma as PrismaService;
    rewards = new RewardsService(prisma);
    orders = new OrdersService(prisma, rewards);
    gateway = new MockGatewayService({ next: () => 'MOCK-G04-SUCCESS' }, 0);
    payments = new PaymentsService(prisma, gateway, new MockOrdersPaymentAdapter(prisma), rewards);
  }, 30_000);

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { await database?.close(); }, 30_000);

  async function seed(overrides: {
    points?: number; stock?: number; maxUses?: number | null; usedCount?: number;
  } = {}) {
    const tag = randomUUID();
    const user = await prisma.user.create({ data: {
      email: `${tag}@rewards.test`, passwordHash: 'test-only',
      loyaltyPoints: overrides.points ?? 8_000,
    } });
    const product = await prisma.product.create({ data: {
      name: 'G-04 regression coffee', price: 110_000, imageUrl: '/fixture.png',
      stock: overrides.stock ?? 100,
    } });
    const coupon = await prisma.coupon.create({ data: {
      code: `G04-${tag}`.toUpperCase(), discountPercent: 10, minOrderValue: 0,
      maxUses: overrides.maxUses === undefined ? 100 : overrides.maxUses,
      usedCount: overrides.usedCount ?? 0,
      expiresAt: new Date('2099-12-31T00:00:00Z'),
    } });
    return { user, product, coupon };
  }

  type Fixture = Awaited<ReturnType<typeof seed>>;

  function place(fixture: Fixture, points = 5_000, withCoupon = true) {
    return orders.create(fixture.user.id, {
      items: [{ productId: fixture.product.id, size: 'S', toppings: [], qty: 1 }],
      couponCode: withCoupon ? fixture.coupon.code : undefined,
      pointsToRedeem: points,
    });
  }

  function payInput(fixture: Fixture, orderId: number, key = randomUUID()) {
    return { userId: fixture.user.id, orderId, method: 'WALLET' as const, idempotencyKey: key };
  }

  async function state(fixture: Fixture) {
    const [coupon, user, product, count, earns, redeems, paymentCount] = await Promise.all([
      prisma.coupon.findUniqueOrThrow({ where: { code: fixture.coupon.code } }),
      prisma.user.findUniqueOrThrow({ where: { id: fixture.user.id } }),
      prisma.product.findUniqueOrThrow({ where: { id: fixture.product.id } }),
      prisma.order.count({ where: { userId: fixture.user.id } }),
      prisma.loyaltyEntry.count({ where: { userId: fixture.user.id, kind: 'EARN' } }),
      prisma.loyaltyEntry.count({ where: { userId: fixture.user.id, kind: 'REDEEM' } }),
      prisma.payment.count({ where: { order: { userId: fixture.user.id } } }),
    ]);
    return {
      usedCount: coupon.usedCount, points: user.loyaltyPoints, stock: product.stock,
      orders: count, earns, redeems, payments: paymentCount,
    };
  }

  it('20 coupon previews consume neither quota nor points', async () => {
    const fixture = await seed({ maxUses: 1 });
    const before = await state(fixture);
    const results = await Promise.all(Array.from({ length: 20 }, () => rewards.validateCoupon({
      code: ` ${fixture.coupon.code.toLowerCase()} `, orderTotal: 110_000,
    })));
    expect(results).toEqual(Array(20).fill({ valid: true, discount: 11_000 }));
    expect(await state(fixture)).toEqual(before);
  });

  it.each([
    { maxUses: 1, usedCount: 0, accepted: 1 },
    { maxUses: 3, usedCount: 1, accepted: 2 },
  ])('10 concurrent orders respect quota $maxUses starting at $usedCount', async (quota) => {
    const fixture = await seed(quota);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => place(fixture, 0)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(quota.accepted);
    for (const result of results) {
      if (result.status === 'rejected') {
        // Already exhausted at read: 400; last slot lost after read: 409.
        expect(result.reason instanceof BadRequestException || result.reason instanceof ConflictException).toBe(true);
      }
    }
    expect(await state(fixture)).toEqual({
      usedCount: quota.maxUses, points: 8_000, stock: 100 - quota.accepted,
      orders: quota.accepted, earns: 0, redeems: 0, payments: 0,
    });
  });

  it('maxUses=null permits concurrent orders and counts each reservation once', async () => {
    const fixture = await seed({ maxUses: null, usedCount: 500 });
    await Promise.all(Array.from({ length: 6 }, () => place(fixture, 0)));
    expect(await state(fixture)).toMatchObject({ usedCount: 506, orders: 6, stock: 94 });
  });

  it('maxUses=0 rejects without reserving quota, points or stock', async () => {
    const fixture = await seed({ maxUses: 0 });
    const before = await state(fixture);
    await expect(place(fixture)).rejects.toBeInstanceOf(BadRequestException);
    expect(await state(fixture)).toEqual(before);
  });

  it('two orders redeeming 80 from balance 100 accept exactly one', async () => {
    const fixture = await seed({ points: 100 });
    const results = await Promise.allSettled([place(fixture, 80, false), place(fixture, 80, false)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(BadRequestException);
    expect(await state(fixture)).toEqual({
      usedCount: 0, points: 20, stock: 99, orders: 1, earns: 0, redeems: 0, payments: 0,
    });
  });

  it('insufficient points roll back the already-reserved coupon', async () => {
    const fixture = await seed({ points: 100, maxUses: 1 });
    const before = await state(fixture);
    await expect(place(fixture, 101)).rejects.toBeInstanceOf(BadRequestException);
    expect(await state(fixture)).toEqual(before);
  });

  it('stock failure rolls back coupon and points reservations', async () => {
    const fixture = await seed({ stock: 0, maxUses: 1 });
    const before = await state(fixture);
    await expect(place(fixture)).rejects.toBeInstanceOf(ConflictException);
    expect(await state(fixture)).toEqual(before);
  });

  it('an aborted create-order transaction rolls back REDEEM and all reservations', async () => {
    const fixture = await seed();
    const before = await state(fixture);
    await expect(prisma.$transaction(async (tx) => {
      const quote = await rewards.reserveCouponAndPoints({
        userId: fixture.user.id, subtotal: 110_000,
        couponCode: fixture.coupon.code, pointsToRedeem: 5_000,
      }, tx);
      const order = await tx.order.create({ data: {
        userId: fixture.user.id, subtotal: 110_000, total: quote.total,
        pointsRedeemed: quote.pointsDiscount, discountTotal: quote.totalDiscount,
        couponCode: fixture.coupon.code,
      } });
      throw new Error('abort-create-order');
    })).rejects.toThrow('abort-create-order');
    expect(await state(fixture)).toEqual(before);
  });

  it('successful payment + 10 replays keep quota, REDEEM and EARN unchanged', async () => {
    const fixture = await seed();
    const order = await place(fixture);
    expect(order).toMatchObject({ subtotal: 110_000, discountTotal: 16_000, pointsRedeemed: 5_000, total: 94_000 });
    const charge = vi.spyOn(gateway, 'charge');
    const input = payInput(fixture, order.id);
    const first = await payments.pay(input);
    const afterSuccess = await state(fixture);
    const replays = await Promise.all(Array.from({ length: 10 }, () => payments.pay(input)));
    expect(replays.every((result) => result.idempotentReplay && result.paymentId === first.paymentId)).toBe(true);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(await state(fixture)).toEqual(afterSuccess);
    expect(afterSuccess).toEqual({
      usedCount: 1, points: 3_940, stock: 99, orders: 1, earns: 1, redeems: 1, payments: 1,
    });
    expect(await prisma.loyaltyEntry.findMany({
      where: { orderId: order.id }, orderBy: { kind: 'asc' }, select: { kind: true, points: true },
    })).toEqual([{ kind: 'EARN', points: 940 }, { kind: 'REDEEM', points: 5_000 }]);
  });

  it('same-key concurrent payments charge and earn once', async () => {
    const fixture = await seed();
    const order = await place(fixture);
    const charge = vi.spyOn(gateway, 'charge');
    const input = payInput(fixture, order.id);
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => payments.pay(input)));
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    for (const result of results) {
      if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'PAYMENT_IN_PROGRESS' });
    }
    expect(charge).toHaveBeenCalledTimes(1);
    expect(await state(fixture)).toEqual({
      usedCount: 1, points: 3_940, stock: 99, orders: 1, earns: 1, redeems: 1, payments: 1,
    });
  });

  it('decline chắc chắn => FAILED, retry key mới trên chính Order cũ', async () => {
    const fixture = await seed();
    const order = await place(fixture);
    const charge = vi.spyOn(gateway, 'charge').mockRejectedValueOnce(new PaymentDeclinedError('MOCK-DECL0000'));
    const input = payInput(fixture, order.id);
    await expect(payments.pay(input)).rejects.toMatchObject({ code: 'PAYMENT_DECLINED' });
    expect(await state(fixture)).toEqual({
      usedCount: 1, points: 3_000, stock: 99, orders: 1, earns: 0, redeems: 0, payments: 1,
    });
    await expect(payments.pay(input)).rejects.toMatchObject({ code: 'PAYMENT_DECLINED' });
    await payments.pay(payInput(fixture, order.id));
    expect(charge).toHaveBeenCalledTimes(2);
    expect(await state(fixture)).toMatchObject({
      usedCount: 1, points: 3_940, stock: 99, orders: 1, earns: 1, redeems: 1, payments: 2,
    });
  });

  it('timeout là UNKNOWN; key khác bị 409; cùng key phục hồi sau lease', async () => {
    const fixture = await seed();
    const order = await place(fixture);
    const charge = vi.spyOn(gateway, 'charge').mockRejectedValueOnce(new GatewayTimeoutError());
    const input = payInput(fixture, order.id);
    await expect(payments.pay(input)).rejects.toMatchObject({ code: 'GATEWAY_TIMEOUT' });
    expect(await prisma.payment.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } }))
      .toMatchObject({ status: 'PENDING' });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PENDING');
    await expect(payments.pay(payInput(fixture, order.id))).rejects.toMatchObject({ code: 'PAYMENT_IN_PROGRESS' });
    await expect(payments.pay(input)).rejects.toMatchObject({ code: 'PAYMENT_IN_PROGRESS' });
    // Giả lập hết lease để không phải sleep 60 giây trong bộ test.
    await prisma.payment.update({ where: { idempotencyKey: input.idempotencyKey },
      data: { processingLeaseUntil: new Date(0) } });
    await payments.pay(input);
    expect(charge).toHaveBeenCalledTimes(2);
    expect(await state(fixture)).toMatchObject({
      usedCount: 1, points: 3_940, stock: 99, orders: 1, earns: 1, redeems: 1, payments: 1,
    });
  });

  it('hai Idempotency-Key khác nhau, cùng Order: chỉ một payment được charge', async () => {
    const fixture = await seed();
    const order = await place(fixture);
    const charge = vi.spyOn(gateway, 'charge');
    const results = await Promise.allSettled([
      payments.pay(payInput(fixture, order.id)), payments.pay(payInput(fixture, order.id)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')?.reason)
      .toMatchObject({ code: expect.stringMatching(/PAYMENT_IN_PROGRESS|ORDER_ALREADY_PAID/) });
    expect(charge).toHaveBeenCalledTimes(1);
    expect(await state(fixture)).toMatchObject({ payments: 1, earns: 1, redeems: 1 });
  });

  it('POST /orders trùng key không giữ quota, điểm hoặc stock lần hai; payload khác => 409', async () => {
    const fixture = await seed();
    const key = randomUUID();
    const payload = { items: [{ productId: fixture.product.id, size: 'S' as const,
      toppings: [] as ('Trân châu' | 'Kem')[], qty: 1 }],
      couponCode: fixture.coupon.code, pointsToRedeem: 5_000 };
    const [first, second] = await Promise.all([
      orders.create(fixture.user.id, payload, key),
      orders.create(fixture.user.id, payload, key),
    ]);
    expect(second.id).toBe(first.id);
    expect(await state(fixture)).toEqual({
      usedCount: 1, points: 3_000, stock: 99, orders: 1, earns: 0, redeems: 0, payments: 0,
    });
    await expect(orders.create(fixture.user.id, { ...payload, pointsToRedeem: 3 }, key))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('CANCELLED hoàn điểm/quota/stock đúng một lần; không có REDEEM ở đơn chưa PAID', async () => {
    const fixture = await seed();
    const before = await state(fixture);
    const order = await place(fixture);
    const first = await orders.cancel(fixture.user.id, order.id);
    const second = await orders.cancel(fixture.user.id, order.id);
    expect(first.status).toBe('CANCELLED');
    expect(second.status).toBe('CANCELLED');
    expect(await state(fixture)).toMatchObject({ ...before, orders: 1 });
    await expect(payments.pay(payInput(fixture, order.id)))
      .rejects.toMatchObject({ code: 'ORDER_NOT_PAYABLE' });
  });

  it('gateway SUCCEEDED nhưng DB settle rollback: không dùng key mới, retry same-key giữ 1 charge logic', async () => {
    const fixture = await seed();
    const order = await place(fixture);
    const input = payInput(fixture, order.id);
    const spy = vi.spyOn(rewards, 'finalizeRewardsOnPaid').mockRejectedValueOnce(new Error('DB unavailable'));
    await expect(payments.pay(input)).rejects.toMatchObject({ code: 'PAYMENT_RECONCILIATION_REQUIRED' });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PENDING');
    expect(await state(fixture)).toMatchObject({ earns: 0, redeems: 0, payments: 1 });
    await expect(payments.pay(payInput(fixture, order.id))).rejects.toMatchObject({ code: 'PAYMENT_IN_PROGRESS' });
    await prisma.payment.update({ where: { idempotencyKey: input.idempotencyKey },
      data: { processingLeaseUntil: new Date(0) } });
    spy.mockRestore();
    const result = await payments.pay(input);
    expect(result.orderStatus).toBe('PAID');
    expect(await state(fixture)).toMatchObject({ earns: 1, redeems: 1, payments: 1 });
  });

  it('same key with changed payload/user is rejected without changing rewards', async () => {
    const fixture = await seed();
    const order = await place(fixture);
    const input = payInput(fixture, order.id);
    await payments.pay(input);
    const before = await state(fixture);
    for (const changed of [{ method: 'CARD' as const }, { orderId: order.id + 1 }, { userId: fixture.user.id + 1 }]) {
      await expect(payments.pay({ ...input, ...changed })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    }
    expect(await state(fixture)).toEqual(before);
  });

  it('10 concurrent finalize/redeem replays keep one ledger row per kind', async () => {
    const fixture = await seed();
    const order = await place(fixture);
    await prisma.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
    const results = await Promise.all(Array.from({ length: 10 }, () => prisma.$transaction(async (tx) => {
      await rewards.createRedeemEntry({ orderId: order.id, userId: fixture.user.id, points: 5_000 }, tx);
      return rewards.finalizeRewardsOnPaid({ orderId: order.id, userId: fixture.user.id, totalPaid: order.total }, tx);
    })));
    expect(results).toEqual(Array(10).fill({ pointsEarned: 940 }));
    expect(await state(fixture)).toEqual({
      usedCount: 1, points: 3_940, stock: 99, orders: 1, earns: 1, redeems: 1, payments: 0,
    });
  });

  it('failed settlement rolls back PAID, ledger and balance; finalize can be retried', async () => {
    const fixture = await seed();
    const order = await place(fixture);
    const before = await state(fixture);
    const finalize = { orderId: order.id, userId: fixture.user.id, totalPaid: order.total };
    await expect(prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
      await rewards.finalizeRewardsOnPaid(finalize, tx);
      throw new Error('abort-settlement');
    })).rejects.toThrow('abort-settlement');
    expect(await state(fixture)).toEqual(before);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'PENDING' });
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
      await rewards.finalizeRewardsOnPaid(finalize, tx);
    });
    expect(await state(fixture)).toMatchObject({ points: 3_940, earns: 1, redeems: 1, usedCount: 1 });
  });

  it('points are capped before balance deduction; a free order earns zero on replay', async () => {
    const fixture = await seed({ points: 200_000 });
    const order = await place(fixture, 200_000);
    expect(order).toMatchObject({ total: 0, pointsRedeemed: 99_000, discountTotal: 110_000 });
    const input = payInput(fixture, order.id);
    await payments.pay(input);
    await payments.pay(input);
    expect(await state(fixture)).toEqual({
      usedCount: 1, points: 101_000, stock: 99, orders: 1, earns: 0, redeems: 1, payments: 1,
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import {
  GATEWAY_REFERENCE_GENERATOR,
  MockGatewayService,
} from '../src/payments/mock-gateway.service.js';
import { PaymentDeclinedError } from '../src/payments/payment.errors.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

let USER_ID: number;
const runId = randomUUID();
const testKey = (suffix: string) => `f04-int-${runId}-${suffix}`;

describe('Payments idempotency (integration, real PostgreSQL)', () => {
  let moduleRef: TestingModule;
  let service: PaymentsService;
  let gateway: MockGatewayService;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GATEWAY_REFERENCE_GENERATOR)
      .useValue({ next: () => 'MOCK-INT1234' })
      .compile();
    await moduleRef.init();

    service = moduleRef.get(PaymentsService);
    gateway = moduleRef.get(MockGatewayService);
    prisma = moduleRef.get(PrismaService);
    const user = await prisma.user.create({
      data: { email: `f04-pay-int-${runId}@example.test`, passwordHash: 'fixture-only' },
    });
    USER_ID = user.id;
  });

  async function cleanFixtureOrders() {
    // Isolate each test; never delete fixed IDs from the application database.
    const orders = await prisma.order.findMany({
      where: { userId: USER_ID }, select: { id: true },
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
      if (prisma && USER_ID) {
        await cleanFixtureOrders();
        await prisma.user.delete({ where: { id: USER_ID } });
      }
    } finally {
      await moduleRef?.close();
    }
  });

  beforeEach(async () => {
    await cleanFixtureOrders();
  });

  function seedOrder(total = 50_000) {
    return prisma.order.create({ data: { userId: USER_ID, total } });
  }

  it('gửi lặp tuần tự cùng key -> 1 payment, gateway 1 lần', async () => {
    const order = await seedOrder();
    const spy = vi.spyOn(gateway, 'charge');
    const input = {
      userId: USER_ID,
      orderId: order.id,
      method: 'WALLET' as const,
      idempotencyKey: testKey('itest-sequential-1'),
    };

    const first = await service.pay(input);
    const second = await service.pay(input);

    expect(second.paymentId).toBe(first.paymentId);
    expect(second.transactionId).toBe(first.transactionId);
    expect(await prisma.payment.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });

  it('hai request đồng thời cùng key -> 1 payment, gateway tối đa 1 lần', async () => {
    const order = await seedOrder();
    const spy = vi.spyOn(gateway, 'charge');
    const input = {
      userId: USER_ID,
      orderId: order.id,
      method: 'WALLET' as const,
      idempotencyKey: testKey('itest-concurrent-1'),
    };

    const results = await Promise.allSettled([service.pay(input), service.pay(input)]);

    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(await prisma.payment.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });

  it('cùng key khác payload -> IDEMPOTENCY_KEY_REUSED', async () => {
    const order = await seedOrder();
    const idempotencyKey = testKey('itest-reuse-1');

    await service.pay({ userId: USER_ID, orderId: order.id, method: 'WALLET', idempotencyKey });

    await expect(
      service.pay({ userId: USER_ID, orderId: order.id, method: 'CARD', idempotencyKey }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('unique constraint ở DB chặn 2 payment cùng key (P2002)', async () => {
    const order = await seedOrder();
    await service.pay({
      userId: USER_ID,
      orderId: order.id,
      method: 'WALLET',
      idempotencyKey: testKey('itest-unique-1'),
    });

    await expect(
      prisma.payment.create({
        data: {
          orderId: order.id,
          idempotencyKey: testKey('itest-unique-1'),
          requestHash: 'x',
          amount: 1,
          method: 'WALLET',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('retry sau decline bằng key mới -> attempt mới trên cùng order', async () => {
    const order = await seedOrder();
    const decline = vi
      .spyOn(gateway, 'charge')
      .mockRejectedValueOnce(new PaymentDeclinedError('MOCK-DECL0000'));

    await expect(
      service.pay({
        userId: USER_ID,
        orderId: order.id,
        method: 'WALLET',
        idempotencyKey: testKey('itest-decline-key'),
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_DECLINED' });
    decline.mockRestore();

    const recovered = await service.pay({
      userId: USER_ID,
      orderId: order.id,
      method: 'WALLET',
      idempotencyKey: testKey('itest-retry-key'),
    });

    expect(recovered.orderStatus).toBe('PAID');
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(2);
  });

  it('decline lần 2 trên cùng order vẫn giữ PAYMENT_FAILED và retry tiếp được', async () => {
    const order = await seedOrder();
    const decline = vi
      .spyOn(gateway, 'charge')
      .mockRejectedValueOnce(new PaymentDeclinedError('MOCK-DECL0000'))
      .mockRejectedValueOnce(new PaymentDeclinedError('MOCK-DECL0000'));

    for (const idempotencyKey of [testKey('itest-decline-2a'), testKey('itest-decline-2b')]) {
      await expect(
        service.pay({ userId: USER_ID, orderId: order.id, method: 'WALLET', idempotencyKey }),
      ).rejects.toMatchObject({ code: 'PAYMENT_DECLINED' });
    }
    decline.mockRestore();

    const afterTwoDeclines = await prisma.order.findUnique({ where: { id: order.id } });
    expect(afterTwoDeclines?.status).toBe('PAYMENT_FAILED');

    const recovered = await service.pay({
      userId: USER_ID,
      orderId: order.id,
      method: 'WALLET',
      idempotencyKey: testKey('itest-decline-2c'),
    });

    expect(recovered.orderStatus).toBe('PAID');
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(3);
  });
});

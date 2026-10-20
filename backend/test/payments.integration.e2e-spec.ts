import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import {
  GATEWAY_REFERENCE_GENERATOR,
  MockGatewayService,
} from '../src/payments/mock-gateway.service.js';
import { PaymentDeclinedError } from '../src/payments/payment.errors.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const USER_ID = 2;

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
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await prisma.payment.deleteMany({ where: { order: { userId: USER_ID } } });
    await prisma.order.deleteMany({ where: { userId: USER_ID } });
    await prisma.user.upsert({
      where: { id: USER_ID },
      update: {},
      create: { id: USER_ID, email: 'fixture-int@brewlite.test', passwordHash: 'fixture' },
    });
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
      idempotencyKey: 'itest-sequential-1',
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
      idempotencyKey: 'itest-concurrent-1',
    };

    const results = await Promise.allSettled([service.pay(input), service.pay(input)]);

    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(await prisma.payment.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });

  it('cùng key khác payload -> IDEMPOTENCY_KEY_REUSED', async () => {
    const order = await seedOrder();
    const idempotencyKey = 'itest-reuse-1';

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
      idempotencyKey: 'itest-unique-1',
    });

    await expect(
      prisma.payment.create({
        data: {
          orderId: order.id,
          idempotencyKey: 'itest-unique-1',
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
        idempotencyKey: 'itest-decline-key',
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_DECLINED' });
    decline.mockRestore();

    const recovered = await service.pay({
      userId: USER_ID,
      orderId: order.id,
      method: 'WALLET',
      idempotencyKey: 'itest-retry-key',
    });

    expect(recovered.orderStatus).toBe('PAID');
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(2);
  });
});

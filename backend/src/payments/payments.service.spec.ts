import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Payment } from '../generated/prisma/client.js';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MockGatewayService, type MockChargeInput } from './mock-gateway.service.js';
import type { OrdersPaymentPort, PayableOrder } from './orders-payment.port.js';
import {
  PaymentDeclinedError,
  PaymentErrorCode,
  GatewayTimeoutError,
} from './payment.errors.js';
import type { PayInput } from './payment.types.js';
import { paymentRequestHash, PaymentsService } from './payments.service.js';

type PaymentCreateData = Omit<Payment, 'id' | 'transactionId' | 'createdAt' | 'updatedAt'>;

function createPrismaMock() {
  const payments: Payment[] = [];
  let nextId = 1;

  const tx = {
    payment: {
      update: vi.fn(
        async ({ where, data }: { where: { id: number }; data: Partial<Payment> }) => {
          const payment = payments.find((item) => item.id === where.id);
          if (!payment) throw new Error('payment not found');
          Object.assign(payment, data, { updatedAt: new Date() });
          return payment;
        },
      ),
    },
    order: {
      findUnique: vi.fn(async () => ({ userId: 1, total: 85_000 })),
    },
  };

  return {
    payment: {
      findUnique: vi.fn(
        async ({ where }: { where: { idempotencyKey: string } }): Promise<Payment | null> =>
          payments.find((item) => item.idempotencyKey === where.idempotencyKey) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: PaymentCreateData }): Promise<Payment> => {
        if (payments.some((item) => item.idempotencyKey === data.idempotencyKey)) {
          throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
        }
        const payment: Payment = {
          id: nextId++,
          transactionId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        payments.push(payment);
        return payment;
      }),
    },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    __payments: payments,
  };
}

function createGateway(charge?: (input: MockChargeInput) => Promise<{ reference: string; status: 'SUCCEEDED' }>) {
  return {
    charge: vi.fn(charge ?? (async () => ({ reference: 'MOCK-ABC123', status: 'SUCCEEDED' as const }))),
  };
}

function createOrders(order: PayableOrder | null) {
  return {
    findOrderForUser: vi.fn(async () => order),
    markPending: vi.fn(async () => undefined),
    markPaid: vi.fn(async () => undefined),
    markPaymentFailed: vi.fn(async () => undefined),
  };
}

const baseInput: PayInput = {
  userId: 1,
  orderId: 10,
  method: 'WALLET',
  idempotencyKey: 'idem-abc-123',
};

function setup(overrides: { order?: PayableOrder | null; gateway?: ReturnType<typeof createGateway> } = {}) {
  const prisma = createPrismaMock();
  const order: PayableOrder | null =
    overrides.order === undefined
      ? { id: 10, userId: 1, status: OrderStatus.PENDING, total: 85_000 }
      : overrides.order;
  const gateway = overrides.gateway ?? createGateway();
  const orders = createOrders(order);
  const rewards = {
    finalizeRewardsOnPaid: vi.fn(async () => undefined),
  };
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    gateway as unknown as MockGatewayService,
    orders as unknown as OrdersPaymentPort,
    rewards as any,
  );
  return { service, prisma, gateway, orders, order, rewards };
}

async function expectPaymentError(promise: Promise<unknown>, code: PaymentErrorCode) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('PaymentsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('thanh toán mới success -> gateway gọi đúng 1 lần, Payment SUCCEEDED, Order PAID', async () => {
    const { service, prisma, gateway, orders } = setup();

    const result = await service.pay(baseInput);

    expect(gateway.charge).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      orderId: 10,
      status: PaymentStatus.SUCCEEDED,
      orderStatus: OrderStatus.PAID,
      method: 'WALLET',
      idempotentReplay: false,
    });
    expect(orders.markPaid).toHaveBeenCalledTimes(1);
    expect(prisma.__payments).toHaveLength(1);
    expect(prisma.__payments[0].status).toBe(PaymentStatus.SUCCEEDED);
  });

  it('order PAYMENT_FAILED -> reset PENDING trước khi gọi gateway', async () => {
    const { service, gateway, orders } = setup({
      order: { id: 10, userId: 1, status: OrderStatus.PAYMENT_FAILED, total: 85_000 },
    });

    const result = await service.pay(baseInput);

    expect(orders.markPending).toHaveBeenCalledWith(10);
    expect(orders.markPending.mock.invocationCallOrder[0]).toBeLessThan(
      gateway.charge.mock.invocationCallOrder[0],
    );
    expect(gateway.charge).toHaveBeenCalledTimes(1);
    expect(result.orderStatus).toBe(OrderStatus.PAID);
  });

  it('amount luôn lấy từ Order.total, không nhận từ client', async () => {
    const { service, prisma } = setup({
      order: { id: 10, userId: 1, status: OrderStatus.PENDING, total: 12_345 },
    });

    const result = await service.pay(baseInput);

    expect(result.amount).toBe(12_345);
    expect(prisma.__payments[0].amount).toBe(12_345);
  });

  it('cùng key + cùng request -> gateway không gọi lần 2, trả lại kết quả đầu', async () => {
    const { service, gateway } = setup();

    const first = await service.pay(baseInput);
    const second = await service.pay(baseInput);

    expect(gateway.charge).toHaveBeenCalledTimes(1);
    expect(second.paymentId).toBe(first.paymentId);
    expect(second.transactionId).toBe(first.transactionId);
    expect(second.idempotentReplay).toBe(true);
  });

  it('cùng key + khác orderId -> 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const { service } = setup();

    await service.pay(baseInput);
    await expectPaymentError(
      service.pay({ ...baseInput, orderId: 11 }),
      PaymentErrorCode.IDEMPOTENCY_KEY_REUSED,
    );
  });

  it('cùng key + khác method -> 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const { service } = setup();

    await service.pay(baseInput);
    await expectPaymentError(
      service.pay({ ...baseInput, method: 'CARD' }),
      PaymentErrorCode.IDEMPOTENCY_KEY_REUSED,
    );
  });

  it('demo decline không bật -> 400 trước khi tạo payment và không gọi gateway', async () => {
    vi.stubEnv('MOCK_GATEWAY_TEST_MODE', 'false');
    const { service, prisma, gateway } = setup();
    await expect(service.pay({ ...baseInput, demoDecline: true }))
      .rejects.toMatchObject({ status: 400 });
    expect(prisma.__payments).toHaveLength(0);
    expect(gateway.charge).not.toHaveBeenCalled();
  });

  it('demo decline bị khóa khi NODE_ENV=production ngay cả nếu bật test mode', async () => {
    vi.stubEnv('MOCK_GATEWAY_TEST_MODE', 'true');
    vi.stubEnv('NODE_ENV', 'production');
    const { service, prisma } = setup();
    await expect(service.pay({ ...baseInput, demoDecline: true }))
      .rejects.toMatchObject({ status: 400 });
    expect(prisma.__payments).toHaveLength(0);
  });

  it('demo mode gọi gateway có reference DECLINE thật; transaction đánh dấu FAILED', async () => {
    vi.stubEnv('MOCK_GATEWAY_TEST_MODE', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    const gateway = createGateway(async (input) => {
      if (input.ref?.endsWith('0000')) throw new PaymentDeclinedError(input.ref);
      return { reference: 'MOCK-OK1234', status: 'SUCCEEDED' };
    });
    const { service, prisma, orders } = setup({ gateway });
    await expectPaymentError(
      service.pay({ ...baseInput, demoDecline: true }),
      PaymentErrorCode.PAYMENT_DECLINED,
    );
    expect(gateway.charge).toHaveBeenCalledWith(expect.objectContaining({ ref: 'MOCK-DEMO-0000' }));
    expect(orders.markPaymentFailed).toHaveBeenCalledTimes(1);
    expect(prisma.__payments[0].status).toBe(PaymentStatus.FAILED);
  });

  it('hash của thanh toán demo và bình thường khác nhau; normal hash giữ tương thích', () => {
    const input = { userId: 1, orderId: 10, method: 'WALLET' };
    expect(paymentRequestHash({ ...input, demoDecline: false })).toBe(paymentRequestHash(input));
    expect(paymentRequestHash({ ...input, demoDecline: true })).not.toBe(paymentRequestHash(input));
  });

  it('gateway decline -> Payment FAILED, Order PAYMENT_FAILED, 402', async () => {
    const gateway = createGateway(async () => {
      throw new PaymentDeclinedError('MOCK-ABC0000');
    });
    const { service, prisma, orders } = setup({ gateway });

    await expectPaymentError(service.pay(baseInput), PaymentErrorCode.PAYMENT_DECLINED);

    expect(orders.markPaymentFailed).toHaveBeenCalledTimes(1);
    expect(prisma.__payments[0].status).toBe(PaymentStatus.FAILED);
  });

  it('gateway timeout -> 504 GATEWAY_TIMEOUT', async () => {
    const gateway = createGateway(async () => {
      throw new GatewayTimeoutError();
    });
    const { service, prisma } = setup({ gateway });

    await expectPaymentError(service.pay(baseInput), PaymentErrorCode.GATEWAY_TIMEOUT);

    expect(prisma.__payments[0].status).toBe(PaymentStatus.FAILED);
  });

  it('order đã PAID -> gateway không được gọi', async () => {
    const { service, gateway } = setup({
      order: { id: 10, userId: 1, status: OrderStatus.PAID, total: 85_000 },
    });

    await expectPaymentError(service.pay(baseInput), PaymentErrorCode.ORDER_ALREADY_PAID);

    expect(gateway.charge).not.toHaveBeenCalled();
  });

  it('order không thuộc user -> ORDER_NOT_FOUND', async () => {
    const { service, gateway } = setup({ order: null });

    await expectPaymentError(service.pay(baseInput), PaymentErrorCode.ORDER_NOT_FOUND);

    expect(gateway.charge).not.toHaveBeenCalled();
  });

  it('thiếu Idempotency-Key -> 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
    const { service, gateway } = setup();

    await expectPaymentError(
      service.pay({ ...baseInput, idempotencyKey: undefined }),
      PaymentErrorCode.IDEMPOTENCY_KEY_REQUIRED,
    );

    expect(gateway.charge).not.toHaveBeenCalled();
  });

  it('Idempotency-Key sai định dạng -> 400 INVALID_IDEMPOTENCY_KEY', async () => {
    const { service } = setup();

    await expectPaymentError(
      service.pay({ ...baseInput, idempotencyKey: 'key with space' }),
      PaymentErrorCode.INVALID_IDEMPOTENCY_KEY,
    );
  });

  it('thua race unique constraint -> replay record thắng, gateway không gọi lần 2', async () => {
    const { service, prisma, gateway } = setup();
    const requestHash = paymentRequestHash({
      userId: baseInput.userId,
      orderId: baseInput.orderId,
      method: baseInput.method,
    });
    const winner: Payment = {
      id: 99,
      orderId: baseInput.orderId,
      idempotencyKey: baseInput.idempotencyKey as string,
      requestHash,
      amount: 85_000,
      method: 'WALLET',
      status: PaymentStatus.SUCCEEDED,
      transactionId: 'MOCK-WINNER',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.payment.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    prisma.payment.create.mockRejectedValueOnce(
      Object.assign(new Error('unique constraint'), { code: 'P2002' }),
    );

    const result = await service.pay(baseInput);

    expect(gateway.charge).not.toHaveBeenCalled();
    expect(result.paymentId).toBe(99);
    expect(result.idempotentReplay).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Payment } from '../generated/prisma/client.js';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RewardsPort } from '../rewards/public.js';
import type { OrdersPaymentPort, PayableOrder } from './orders-payment.port.js';
import type { MockGatewayService } from './mock-gateway.service.js';
import { PaymentDeclinedError, GatewayTimeoutError } from './payment.errors.js';
import type { PayInput } from './payment.types.js';
import { PaymentsService, paymentRequestHash } from './payments.service.js';

const input: PayInput = { userId: 1, orderId: 10, method: 'WALLET', idempotencyKey: 'pay-unit-1' };
const pending: PayableOrder = { id: 10, userId: 1, status: OrderStatus.PENDING, total: 85_000 };

function setup(order: PayableOrder | null = { ...pending }) {
  const payments: Payment[] = [];
  let id = 0;
  const create = vi.fn(async ({ data }: { data: Partial<Payment> }) => {
    if (payments.some((p) => p.idempotencyKey === data.idempotencyKey ||
      (p.orderId === data.orderId && [PaymentStatus.PENDING, PaymentStatus.SUCCEEDED].includes(p.status)))) {
      throw Object.assign(new Error('unique'), { code: 'P2002' });
    }
    const row = { id: ++id, createdAt: new Date(), updatedAt: new Date(),
      transactionId: null, processingLeaseUntil: null, ...data } as Payment;
    payments.push(row);
    return row;
  });
  const updateMany = vi.fn(async ({ where, data }: {
    where: { id: number; status?: PaymentStatus; OR?: unknown }; data: Partial<Payment>;
  }) => {
    const row = payments.find((p) => p.id === where.id);
    if (!row || (where.status && row.status !== where.status)) return { count: 0 };
    if (where.OR && row.processingLeaseUntil && row.processingLeaseUntil > new Date()) return { count: 0 };
    Object.assign(row, data);
    return { count: 1 };
  });
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 10 }]),
    order: { findFirst: vi.fn(async () => order) },
    payment: {
      create,
      updateMany,
      update: vi.fn(async ({ where, data }: { where: { id: number }; data: Partial<Payment> }) => {
        const row = payments.find((p) => p.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  };
  const prisma = {
    payment: {
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        payments.find((p) => p.idempotencyKey === where.idempotencyKey) ?? null),
      updateMany,
    },
    $transaction: vi.fn(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const orders = {
    findOrderForUser: vi.fn(async (orderId: number, userId: number) =>
      order?.id === orderId && order?.userId === userId ? order : null),
    markPaid: vi.fn(async () => { if (order) order.status = OrderStatus.PAID; }),
    markPaymentFailed: vi.fn(async () => { if (order) order.status = OrderStatus.PAYMENT_FAILED; }),
  };
  const rewards = {
    reserveCouponAndPoints: vi.fn(), createRedeemEntry: vi.fn(), releaseOnCancel: vi.fn(),
    finalizeRewardsOnPaid: vi.fn().mockResolvedValue({ pointsEarned: 850 }),
  };
  const gateway = { charge: vi.fn(async () => ({ reference: 'MOCK-ONE', status: 'SUCCEEDED' as const })) };
  const service = new PaymentsService(prisma as unknown as PrismaService,
    gateway as unknown as MockGatewayService, orders as unknown as OrdersPaymentPort,
    rewards as unknown as RewardsPort);
  return { service, payments, prisma, orders, tx, gateway, rewards, order };
}

async function code(promise: Promise<unknown>, expected: string) {
  await expect(promise).rejects.toMatchObject({ code: expected });
}

describe('G-03/G-04 payment regression (unit)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SUCCESS: chỉ một gateway, PAID + reward cùng transaction', async () => {
    const t = setup();
    const result = await t.service.pay(input);
    expect(result).toMatchObject({ orderStatus: 'PAID', status: 'SUCCEEDED', amount: 85_000 });
    expect(t.orders.markPaid).toHaveBeenCalledOnce();
    expect(t.rewards.finalizeRewardsOnPaid).toHaveBeenCalledExactlyOnceWith(
      { orderId: 10, userId: 1, totalPaid: 85_000 }, t.tx,
    );
    expect(t.gateway.charge).toHaveBeenCalledTimes(1);
    const replay = await t.service.pay(input);
    expect(replay.idempotentReplay).toBe(true);
    expect(t.gateway.charge).toHaveBeenCalledTimes(1);
  });

  it('cùng key nhưng khác method/user/order => 409', async () => {
    const t = setup();
    await t.service.pay(input);
    for (const other of [{ method: 'CARD' as const }, { userId: 2 }, { orderId: 11 }]) {
      await code(t.service.pay({ ...input, ...other }), 'IDEMPOTENCY_KEY_REUSED');
    }
  });

  it('thiếu key và key không hợp lệ => 400; không gọi gateway', async () => {
    const t = setup();
    await code(t.service.pay({ ...input, idempotencyKey: undefined }), 'IDEMPOTENCY_KEY_REQUIRED');
    await code(t.service.pay({ ...input, idempotencyKey: 'not valid' }), 'INVALID_IDEMPOTENCY_KEY');
    expect(t.gateway.charge).not.toHaveBeenCalled();
  });

  it('không được phép thanh toán đơn thuộc user khác / đã PAID', async () => {
    await code(setup(null).service.pay(input), 'ORDER_NOT_FOUND');
    await code(setup({ ...pending, status: OrderStatus.PAID }).service.pay(input), 'ORDER_ALREADY_PAID');
  });

  it('DECLINED: đánh dấu FAILED và cho phép retry bằng key mới', async () => {
    const t = setup();
    t.gateway.charge.mockRejectedValueOnce(new PaymentDeclinedError('MOCK-0000'));
    await code(t.service.pay(input), 'PAYMENT_DECLINED');
    expect(t.payments[0].status).toBe(PaymentStatus.FAILED);
    expect(t.orders.markPaymentFailed).toHaveBeenCalledOnce();
    await code(t.service.pay(input), 'PAYMENT_DECLINED');
    const newInput = { ...input, idempotencyKey: 'pay-unit-2' };
    await t.service.pay(newInput);
    expect(t.gateway.charge).toHaveBeenCalledTimes(2);
  });

  it('TIMEOUT: để PENDING, không mark FAILED, không cho key khác', async () => {
    const t = setup();
    t.gateway.charge.mockRejectedValueOnce(new GatewayTimeoutError());
    await code(t.service.pay(input), 'GATEWAY_TIMEOUT');
    expect(t.payments[0].status).toBe(PaymentStatus.PENDING);
    expect(t.orders.markPaymentFailed).not.toHaveBeenCalled();
    await code(t.service.pay({ ...input, idempotencyKey: 'pay-unit-new' }), 'PAYMENT_IN_PROGRESS');
    await code(t.service.pay(input), 'PAYMENT_IN_PROGRESS');
    t.payments[0].processingLeaseUntil = new Date(0);
    await t.service.pay(input);
    expect(t.payments).toHaveLength(1);
    expect(t.gateway.charge).toHaveBeenCalledTimes(2);
  });

  it('SUCCESS gateway nhưng transaction finalization lỗi => giữ PENDING, replay cùng key', async () => {
    const t = setup();
    t.rewards.finalizeRewardsOnPaid.mockRejectedValueOnce(new Error('DB lost'));
    await code(t.service.pay(input), 'PAYMENT_RECONCILIATION_REQUIRED');
    // Mock không rollback nội bộ, nhưng trạng thái thực tế của Prisma sẽ rollback cả transaction.
    t.payments[0].status = PaymentStatus.PENDING;
    t.payments[0].transactionId = null;
    t.payments[0].processingLeaseUntil = new Date(0);
    if (t.order) t.order.status = OrderStatus.PENDING;
    await t.service.pay(input);
    expect(t.payments).toHaveLength(1);
    expect(t.gateway.charge).toHaveBeenCalledTimes(2);
  });

  it('thua unique race cùng key => replay payment thắng', async () => {
    const t = setup();
    const winner: Payment = {
      id: 9, orderId: 10, idempotencyKey: input.idempotencyKey!,
      requestHash: paymentRequestHash(input), amount: 85_000, method: 'WALLET',
      status: PaymentStatus.SUCCEEDED, transactionId: 'MOCK-WINNER',
      processingLeaseUntil: null, createdAt: new Date(), updatedAt: new Date(),
    };
    t.prisma.payment.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    t.tx.payment.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    expect((await t.service.pay(input)).idempotentReplay).toBe(true);
    expect(t.gateway.charge).not.toHaveBeenCalled();
  });
});

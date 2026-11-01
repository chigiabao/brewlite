/** FIX 11 — Unit tests Mock Payment, không cần PostgreSQL. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OrdersPaymentPort } from './orders-payment.port.js';
import type { RewardsPort } from '../rewards/public.js';
import { MockPaymentService } from './mock-payment.service.js';
import { PaymentErrorCode } from './payment.errors.js';

type Row = { id: number; userId: number; status: OrderStatus; total: number; pointsRedeemed: number };
type PaymentRow = { id: number; orderId: number; idempotencyKey: string; requestHash: string;
  amount: number; method: string; status: PaymentStatus };

function fixture() {
  const order: Row = { id: 7, userId: 42, status: OrderStatus.PENDING, total: 45000, pointsRedeemed: 3000 };
  const payments: PaymentRow[] = [];
  const paymentDb = {
    findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
      payments.find(p => p.idempotencyKey === where.idempotencyKey) ?? null),
    findFirst: vi.fn(async () => payments.find(p => p.status === PaymentStatus.PENDING) ?? null),
    create: vi.fn(async ({ data }: { data: Omit<PaymentRow, 'id'> }) => {
      const payment = { id: payments.length + 1, ...data };
      payments.push(payment);
      return payment;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: number }; data: { status: PaymentStatus } }) => {
      const payment = payments.find(p => p.id === where.id)!;
      Object.assign(payment, data);
      return payment;
    }),
  };
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: order.id }]),
    order: { findFirst: vi.fn(async ({ where }: { where: { id: number; userId: number } }) =>
      where.id === order.id && where.userId === order.userId ? order : null) },
    payment: paymentDb,
  };
  const prisma = { $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) };
  const orders = {
    markPending: vi.fn(async () => { order.status = OrderStatus.PENDING; }),
    markPaid: vi.fn(async () => { order.status = OrderStatus.PAID; }),
    markPaymentFailed: vi.fn(async () => { order.status = OrderStatus.PAYMENT_FAILED; }),
  };
  const rewards = { finalizeRewardsOnPaid: vi.fn(async () => ({ pointsEarned: 4 })) };
  const service = new MockPaymentService(
    prisma as unknown as PrismaService,
    orders as unknown as OrdersPaymentPort,
    rewards as unknown as RewardsPort,
  );
  const input = { userId: 42, orderId: 7, method: 'WALLET' as const,
    demoDecline: false, idempotencyKey: 'fix11-key-1' };
  return { order, payments, paymentDb, tx, prisma, orders, rewards, service, input };
}

describe('FIX 11: mock pay + idempotency + loyalty', () => {
  const previous = process.env.MOCK_GATEWAY_TEST_MODE;
  beforeEach(() => { process.env.MOCK_GATEWAY_TEST_MODE = 'true'; process.env.PAYMENT_PROVIDER = 'MOCK'; });
  afterEach(() => {
    if (previous === undefined) delete process.env.MOCK_GATEWAY_TEST_MODE;
    else process.env.MOCK_GATEWAY_TEST_MODE = previous;
    delete process.env.PAYMENT_PROVIDER;
  });

  it('Thanh toán thành công: tạo Payment, cập nhật PAID và finalise reward đúng một lần', async () => {
    const f = fixture();
    const first = await f.service.pay(f.input);
    const replay = await f.service.pay(f.input);
    expect(first).toMatchObject({ status: 'SUCCEEDED', orderStatus: 'PAID', idempotentReplay: false });
    expect(replay).toMatchObject({ status: 'SUCCEEDED', orderStatus: 'PAID', idempotentReplay: true });
    expect(f.payments).toHaveLength(1);
    expect(f.orders.markPaid).toHaveBeenCalledTimes(1);
    expect(f.rewards.finalizeRewardsOnPaid).toHaveBeenCalledTimes(1);
    expect(f.rewards.finalizeRewardsOnPaid).toHaveBeenCalledWith(
      { orderId: 7, userId: 42, totalPaid: 45000, pointsRedeemed: 3000 }, f.tx,
    );
  });

  it('Thanh toán từ chối giữ Order; thử lại khác key thành công và không tạo thêm đơn', async () => {
    const f = fixture();
    const failed = await f.service.pay({ ...f.input, demoDecline: true });
    expect(failed).toMatchObject({ status: 'FAILED', orderStatus: 'PAYMENT_FAILED' });
    expect(f.rewards.finalizeRewardsOnPaid).not.toHaveBeenCalled();
    expect(f.order.status).toBe(OrderStatus.PAYMENT_FAILED);
    expect(await f.service.pay({ ...f.input, demoDecline: true })).toMatchObject({ idempotentReplay: true });
    const ok = await f.service.pay({ ...f.input, idempotencyKey: 'fix11-key-2' });
    expect(ok.status).toBe('SUCCEEDED');
    expect(f.orders.markPending).toHaveBeenCalledOnce();
    expect(f.orders.markPaid).toHaveBeenCalledOnce();
    expect(f.payments).toHaveLength(2);
  });

  it('Chặn key dùng khác nội dung, key rỗng và đơn không thuộc người dùng', async () => {
    const f = fixture();
    await f.service.pay(f.input);
    await expect(f.service.pay({ ...f.input, method: 'CARD' })).rejects.toMatchObject({
      code: PaymentErrorCode.IDEMPOTENCY_KEY_REUSED,
    });
    await expect(f.service.pay({ ...f.input, idempotencyKey: '' })).rejects.toMatchObject({
      code: PaymentErrorCode.IDEMPOTENCY_KEY_REQUIRED,
    });
    await expect(f.service.pay({ ...f.input, userId: 1000, idempotencyKey: 'fix11-other' })).rejects.toMatchObject({
      code: PaymentErrorCode.ORDER_NOT_FOUND,
    });
  });

  it('Không cho demo thất bại nếu backend tắt cờ', async () => {
    process.env.MOCK_GATEWAY_TEST_MODE = 'false';
    const f = fixture();
    await expect(f.service.pay({ ...f.input, demoDecline: true })).rejects.toMatchObject({ code: PaymentErrorCode.ORDER_NOT_PAYABLE });
    expect(f.payments).toHaveLength(0);
  });
});

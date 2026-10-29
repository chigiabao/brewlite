import { describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';
import { PaymentStatus } from '../generated/prisma/enums.js';

describe('Payments (idempotency) - Task 10 (b)', () => {
  it('gửi 2 lần cùng Idempotency-Key chỉ tạo 1 Payment', async () => {
    const payments: any[] = [];
    let nextId = 1;

    const mockPrisma = {
      payment: {
        findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) => {
          return payments.find((p) => p.idempotencyKey === where.idempotencyKey) ?? null;
        }),
        create: vi.fn(async ({ data }: { data: any }) => {
          const payment = { id: nextId++, ...data, transactionId: null };
          payments.push(payment);
          return payment;
        }),
      },
      $transaction: vi.fn(async (cb: any) =>
        cb({
          payment: {
            update: vi.fn(async ({ where, data }: any) => {
              const p = payments.find((item) => item.id === where.id);
              if (p) Object.assign(p, data);
              return p;
            }),
          },
          order: { findUnique: vi.fn(async () => ({ userId: 1, total: 50000 })) },
        }),
      ),
    };

    const mockGateway = {
      charge: vi.fn(async () => ({ reference: 'REF-001', status: 'SUCCEEDED' as const })),
    };

    const mockOrders = {
      findOrderForUser: vi.fn(async () => ({ id: 1, userId: 1, status: 'PENDING', total: 50000 })),
      markPaid: vi.fn(),
      markPaymentFailed: vi.fn(),
      markPending: vi.fn(),
    };

    const mockRewards = {
      finalizeRewardsOnPaid: vi.fn(),
    };

    const service = new PaymentsService(
      mockPrisma as any,
      mockGateway as any,
      mockOrders as any,
      mockRewards as any,
    );

    const input = {
      userId: 1,
      orderId: 1,
      method: 'WALLET' as const,
      idempotencyKey: 'idem-test-key-001',
    };

    // Gửi lần 1
    const res1 = await service.pay(input);
    expect(res1.status).toBe(PaymentStatus.SUCCEEDED);
    expect(res1.idempotentReplay).toBe(false);
    expect(mockGateway.charge).toHaveBeenCalledTimes(1);

    // Gửi lần 2 với cùng key
    const res2 = await service.pay(input);
    expect(res2.idempotentReplay).toBe(true);
    expect(mockGateway.charge).toHaveBeenCalledTimes(1); // Gateway không bị gọi lại lần 2
    expect(payments.length).toBe(1); // Chỉ có 1 bản ghi thanh toán được tạo
  });
});

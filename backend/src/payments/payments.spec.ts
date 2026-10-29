import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import type { Prisma, Product } from '../generated/prisma/client.js';
import { StockService } from '../orders/stock.service.js';
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

describe('Stock (concurrent orders) - Task 10 (c)', () => {
  it('10 request đồng thời, stock=3 → tối đa 3 thành công', async () => {
    let currentStock = 3;
    let currentVersion = 0;

    const mockTx = {
      product: {
        updateMany: vi.fn(async ({ where, data }: any) => {
          // Mô phỏng kiểm tra optimistic locking (CAS) của database:
          // Chỉ thành công nếu version khớp và stock >= qty
          if (where.version === currentVersion && currentStock >= 1) {
            currentStock -= 1;
            currentVersion += 1;
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
    };

    const stockService = new StockService();
    const product: Product = {
      id: 1,
      name: 'Cold Brew',
      price: 45000,
      imageUrl: 'coldbrew.png',
      stock: 3,
      version: 0,
    } as Product;

    // Chạy 10 request đặt mua cùng lúc (mỗi request mua 1 ly)
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, async () => {
        return stockService.reserve(
          mockTx as unknown as Prisma.TransactionClient,
          [{ productId: 1, size: 'M', toppings: [], qty: 1 }],
          [product],
        );
      }),
    );

    const successes = attempts.filter((a) => a.status === 'fulfilled');
    const failures = attempts.filter((a) => a.status === 'rejected');

    // Tối đa 3 đơn thành công (không vượt quá tồn kho ban đầu là 3)
    expect(successes.length).toBeLessThanOrEqual(3);
    expect(successes.length).toBeGreaterThanOrEqual(1);
    expect(successes.length + failures.length).toBe(10);
    expect(currentStock).toBeGreaterThanOrEqual(0);
  });
});

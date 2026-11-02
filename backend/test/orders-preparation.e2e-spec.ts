/**
 * FIX 08 — E2E với PostgreSQL thật cho vòng đời pha chế.
 *
 * Chỉ tạo/xóa user và order riêng của bài kiểm thử. Không làm sạch toàn bộ DB.
 * Không mở HTTP endpoint đổi trạng thái vì MVP chưa có phân quyền nhân viên.
 */
import { randomUUID } from 'node:crypto';
import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { OrderStatus } from '../src/generated/prisma/enums.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('FIX 08 — Ordering preparation E2E (PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let orders: OrdersService;
  let userId: number;
  let paidOrderId: number;
  let pendingOrderId: number;
  const userEmail = `fix08-${randomUUID()}@example.test`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    orders = app.get(OrdersService);

    const user = await db.user.create({
      data: { email: userEmail, passwordHash: 'test-only' },
    });
    userId = user.id;

    // Fixture PAID đại diện cho đơn đã được Payments hoàn tất trước đó.
    // Test này chỉ kiểm thử module E, không giả lập gateway hay viết lại nghiệp vụ F.
    const paid = await db.order.create({
      data: { userId, total: 25_000, status: OrderStatus.PAID },
    });
    const pending = await db.order.create({
      data: { userId, total: 25_000, status: OrderStatus.PENDING },
    });
    paidOrderId = paid.id;
    pendingOrderId = pending.id;
  });

  afterAll(async () => {
    try {
      if (db && userId) {
        // Chỉ dọn những dòng do test này sở hữu.
        await db.order.deleteMany({ where: { userId } });
        await db.user.delete({ where: { id: userId } });
      }
    } finally {
      await app?.close();
    }
  });

  it('PAID → PREPARING → READY → COMPLETED được lưu thật vào PostgreSQL', async () => {
    for (const status of [
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.COMPLETED,
    ]) {
      await expect(orders.advancePreparation(paidOrderId, status))
        .resolves.toEqual({ id: paidOrderId, status });
      const actual = await db.order.findUniqueOrThrow({ where: { id: paidOrderId } });
      expect(actual.status).toBe(status);
    }
    await expect(orders.advancePreparation(paidOrderId, OrderStatus.PREPARING))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('không thể pha chế đơn PENDING hay chuyển thẳng sang READY', async () => {
    await expect(orders.advancePreparation(pendingOrderId, OrderStatus.PREPARING))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(orders.advancePreparation(pendingOrderId, OrderStatus.READY))
      .rejects.toBeInstanceOf(ConflictException);
    expect((await db.order.findUniqueOrThrow({ where: { id: pendingOrderId } })).status)
      .toBe(OrderStatus.PENDING);
  });

  it('hai cập nhật đồng thời trên PostgreSQL: chỉ một thao tác được chấp nhận', async () => {
    const raceOrder = await db.order.create({
      data: { userId, total: 18_000, status: OrderStatus.PAID },
    });
    const results = await Promise.allSettled([
      orders.advancePreparation(raceOrder.id, OrderStatus.PREPARING),
      orders.advancePreparation(raceOrder.id, OrderStatus.PREPARING),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: raceOrder.id } })).status)
      .toBe(OrderStatus.PREPARING);
  });

  it('không thể tự chuyển tình trạng thanh toán thông qua luồng pha chế', async () => {
    await expect(orders.advancePreparation(pendingOrderId, OrderStatus.PAID as never))
      .rejects.toThrow('ORDER_PREPARATION_TARGET_INVALID');
    expect((await db.order.findUniqueOrThrow({ where: { id: pendingOrderId } })).status)
      .toBe(OrderStatus.PENDING);
  });
});

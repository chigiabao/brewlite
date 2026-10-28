import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersService } from './orders.service.js';
import { StockService } from './stock.service.js';

describe('Orders rollback and stock concurrency (real PostgreSQL)', () => {
  let prisma: PrismaService;
  let ordersService: OrdersService;

  const productIds: number[] = [];
  const userIds: number[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    ordersService = new OrdersService(prisma, new StockService());
  });

  afterEach(async () => {
    // Chỉ xóa dữ liệu thử do test tạo ra.
    if (!prisma) return;

    if (userIds.length > 0) {
      const orders = await prisma.order.findMany({
        where: { userId: { in: userIds } },
        select: { id: true },
      });

      const orderIds = orders.map((order) => order.id);

      if (orderIds.length > 0) {
        await prisma.orderItem.deleteMany({
          where: { orderId: { in: orderIds } },
        });

        await prisma.order.deleteMany({
          where: { id: { in: orderIds } },
        });
      }

      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });

      userIds.length = 0;
    }

    if (productIds.length > 0) {
      await prisma.product.deleteMany({
        where: { id: { in: productIds } },
      });

      productIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function createTestUser() {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const user = await prisma.user.create({
      data: {
        email: `ordering-e2e-${suffix}@example.test`,
        passwordHash: 'test-only-hash',
      },
    });

    userIds.push(user.id);
    return user;
  }

  async function createTestProduct(stock: number) {
    const product = await prisma.product.create({
      data: {
        name: `Ordering E2E ${Date.now()}-${Math.random().toString(36).slice(2)}`,
        price: 30000,
        imageUrl: 'https://example.test/ordering-e2e.png',
        stock,
        version: 0,
      },
    });

    productIds.push(product.id);
    return product;
  }

  function orderDto(productId: number) {
    return {
      items: [
        {
          productId,
          size: 'S' as const,
          toppings: [] as ('Trân châu' | 'Kem')[],
          qty: 1,
        },
      ],
    };
  }

  it('rolls back stock and version when order creation fails', async () => {
    const product = await createTestProduct(5);

    const before = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true, version: true },
    });

    // ID này không tồn tại: tạo Order sẽ lỗi khóa ngoại
    // sau khi stock.reserve() đã chạy trong transaction.
    const nonexistentUserId = -999999999;

    await expect(
      ordersService.create(nonexistentUserId, orderDto(product.id)),
    ).rejects.toThrow();

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true, version: true },
    });

    expect(after.stock).toBe(before.stock);
    expect(after.version).toBe(before.version);

    const orderCount = await prisma.order.count({
      where: { userId: nonexistentUserId },
    });

    expect(orderCount).toBe(0);
  });

  it('allows only one order when two requests compete for the last unit', async () => {
    const user = await createTestUser();
    const product = await createTestProduct(1);

    const results = await Promise.allSettled([
      ordersService.create(user.id, orderDto(product.id), 'stock-race-key-1'),
      ordersService.create(user.id, orderDto(product.id), 'stock-race-key-2'),
    ]);
    const successes = results.filter((result) => result.status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true, version: true },
    });

    expect(after.stock).toBe(0);
    expect(after.version).toBe(1);

    const orderCount = await prisma.order.count({
      where: { userId: user.id },
    });

    expect(orderCount).toBe(1);
  });
  it('creates only one order when concurrent requests use the same idempotency key', async () => {
    const user = await createTestUser();
    const product = await createTestProduct(5);
    const key = `same-key-${Date.now()}`;

    const results = await Promise.allSettled([
      ordersService.create(user.id, orderDto(product.id), key),
      ordersService.create(user.id, orderDto(product.id), key),
    ]);

    // Cả hai request đều thành công và trả về cùng một đơn hàng.
    const successes = results.filter((result) => result.status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');

    expect(successes).toHaveLength(2);
    expect(failures).toHaveLength(0);

    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        idempotencyKey: true,
      },
    });

    expect(orders).toHaveLength(1);
    expect(orders[0].idempotencyKey).toBe(key);

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true, version: true },
    });

    // Chỉ trừ một sản phẩm, version chỉ tăng một lần.
    expect(after.stock).toBe(4);
    expect(after.version).toBe(1);
  });

  it('keeps stock non-negative under 20 concurrent requests', async () => {
    const user = await createTestUser();
    const product = await createTestProduct(10);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        ordersService.create(
          user.id,
          orderDto(product.id),
          `stress-key-${Date.now()}-${i}`,
        ),
      ),
    );

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true, version: true },
    });

    const orderCount = await prisma.order.count({
      where: { userId: user.id },
    });

    const successes = results.filter((result) => result.status === 'fulfilled');

    expect(after.stock).toBeGreaterThanOrEqual(0);
    expect(after.stock).toBe(10 - successes.length);
    expect(after.version).toBe(successes.length);
    expect(orderCount).toBe(successes.length);
    expect(successes.length).toBeLessThanOrEqual(10);
  });
});

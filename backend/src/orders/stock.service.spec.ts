
import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Product } from '../generated/prisma/client.js';
import { OrderStatus } from '../generated/prisma/enums.js';
import { StockService } from './stock.service.js';
import type { OrderItemDto } from './orders.dto.js';

describe('StockService', () => {
  let service: StockService;

  // Giả lập transaction client; không kết nối PostgreSQL thật.
  let tx: {
    product: {
      updateMany: ReturnType<typeof vi.fn>;
    };
  };

  const makeProduct = (
    overrides: Partial<Product> = {},
  ): Product =>
    ({
      id: 1,
      name: 'Trà sữa',
      price: 30000,
      imageUrl: 'tea.png',
      stock: 10,
      version: 0,
      ...overrides,
    }) as Product;

  const makeItem = (
    overrides: Partial<OrderItemDto> = {},
  ): OrderItemDto => ({
    productId: 1,
    size: 'M',
    toppings: [],
    qty: 1,
    ...overrides,
  });

  beforeEach(() => {
    service = new StockService();

    tx = {
      product: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
  });

  it('gom số lượng của cùng sản phẩm trước khi trừ kho', async () => {
    const items = [
      makeItem({ qty: 2 }),
      makeItem({ qty: 3 }),
    ];

    await service.reserve(
      tx as unknown as Prisma.TransactionClient,
      items,
      [makeProduct()],
    );

    expect(tx.product.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1,
        version: 0,
        stock: { gte: 5 },
      },
      data: {
        stock: { decrement: 5 },
        version: { increment: 1 },
      },
    });
  });

  it('báo lỗi nếu sản phẩm không tồn tại trong danh sách đã đọc', async () => {
    await expect(
      service.reserve(
        tx as unknown as Prisma.TransactionClient,
        [makeItem()],
        [],
      ),
    ).rejects.toThrow(NotFoundException);

    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('báo lỗi nếu tồn kho không đủ', async () => {
    await expect(
      service.reserve(
        tx as unknown as Prisma.TransactionClient,
        [makeItem({ qty: 11 })],
        [makeProduct({ stock: 10 })],
      ),
    ).rejects.toThrow(ConflictException);

    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('báo lỗi khi cập nhật thất bại do version hoặc tồn kho thay đổi', async () => {
    tx.product.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.reserve(
        tx as unknown as Prisma.TransactionClient,
        [makeItem({ qty: 2 })],
        [makeProduct()],
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('cập nhật sản phẩm theo thứ tự ID tăng dần', async () => {
    await service.reserve(
      tx as unknown as Prisma.TransactionClient,
      [
        makeItem({ productId: 2, qty: 1 }),
        makeItem({ productId: 1, qty: 1 }),
      ],
      [
        makeProduct({ id: 2, stock: 10 }),
        makeProduct({ id: 1, stock: 10 }),
      ],
    );

    expect(tx.product.updateMany.mock.calls.map(
      ([args]) => args.where.id,
    )).toEqual([1, 2]);
  });
});

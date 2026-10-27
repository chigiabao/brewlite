// TODO(E – Task 10.3): kiểm soát tồn kho khi đặt đồng thời.
// Trong transaction của POST /orders: đọc Product (stock, version), rồi
// updateMany({ where: { id, version }, data: { stock: { decrement }, version: { increment: 1 } } }).
// count = 0 nghĩa là có người khác vừa đổi → thử lại hoặc báo hết hàng.
// export {};

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Product } from '../generated/prisma/client.js';
import type { OrderItemDto } from './orders.dto.js';

@Injectable()
export class StockService {
  async reserve(
    tx: Prisma.TransactionClient,
    items: OrderItemDto[],
    products: Product[],
  ): Promise<void> {
    // Gom số lượng nếu cùng một sản phẩm xuất hiện nhiều lần.
    const demand = new Map<number, number>();

    for (const item of items) {
      demand.set(
        item.productId,
        (demand.get(item.productId) ?? 0) + item.qty,
      );
    }

    // Luôn cập nhật theo thứ tự ID để giảm nguy cơ deadlock.
    const productIds = [...demand.keys()].sort((a, b) => a - b);
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );

    for (const productId of productIds) {
      const qty = demand.get(productId)!;
      const product = productsById.get(productId);

      if (!product) {
        throw new NotFoundException('PRODUCT_NOT_FOUND');
      }

      if (product.stock < qty) {
        throw new ConflictException('OUT_OF_STOCK');
      }

      // Chỉ trừ kho nếu version chưa thay đổi và stock vẫn đủ.
      const result = await tx.product.updateMany({
        where: {
          id: product.id,
          version: product.version,
          stock: { gte: qty },
        },
        data: {
          stock: { decrement: qty },
          version: { increment: 1 },
        },
      });

      if (result.count !== 1) {
        throw new ConflictException('STOCK_VERSION_CONFLICT');
      }
    }
  }
}

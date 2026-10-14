import { Injectable, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto } from './orders.dto.js';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(E – Task 6): lấy giá gốc từ DB, tính lại bằng unitPrice() (common/pricing.ts),
  // lưu Order trạng thái PENDING kèm OrderItem, trả { id, status, total }.
  // TODO(G – Task 10): trừ tồn kho trong transaction (stock.service.ts) và áp couponCode.
  create(userId: number, dto: CreateOrderDto) {
    throw new NotImplementedException('POST /orders chưa làm (E – Task 6)');
  }

  // TODO(F – Task 9): trả [{ id, status, total, createdAt }] của user, mới nhất trước.
  findMine(userId: number) {
    throw new NotImplementedException('GET /orders/me chưa làm (F – Task 9)');
  }
}

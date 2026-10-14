import { Injectable, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(B – Task 2): trả danh sách [{ id, name, price, imageUrl }] từ bảng Product.
  findAll() {
    throw new NotImplementedException('GET /products chưa làm (B – Task 2)');
  }

  // TODO(B – Task 2): trả chi tiết 1 sản phẩm; không có thì NotFoundException.
  findOne(id: number) {
    throw new NotImplementedException(`GET /products/${id} chưa làm (B – Task 2)`);
  }
}

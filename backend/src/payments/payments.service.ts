import { Injectable, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MockGatewayService } from './mock-gateway.service.js';
import { PayDto } from './payments.dto.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MockGatewayService,
  ) {}

  // TODO(F – Task 8): gọi gateway.charge(), đổi order.status thành PAID hoặc PAYMENT_FAILED.
  // TODO(G – Task 10.2): kiểm tra idempotencyKey đã dùng chưa; nếu rồi thì trả kết quả cũ.
  // TODO(G – Task 10.1): gọi assertTransition() trước khi đổi status.
  // TODO(G – Task 10.4): cộng loyaltyPoints cho user sau khi đơn PAID.
  pay(userId: number, dto: PayDto, idempotencyKey: string) {
    throw new NotImplementedException('POST /payments chưa làm (F – Task 8, G – Task 10)');
  }
}

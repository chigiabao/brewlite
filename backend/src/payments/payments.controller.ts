import { Body, Controller, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../auth/public.js';
import { PayDto } from './payments.dto.js';
import { PaymentsService } from './payments.service.js';
import type { PaymentResult } from './payment.types.js';

/** G-03: người thanh toán phải khớp owner của order qua JWT. */
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  pay(@CurrentUser() user: AuthUser, @Headers('idempotency-key') key: string | undefined,
    @Body() dto: PayDto): Promise<PaymentResult> {
    return this.payments.pay({ userId: user.userId, orderId: dto.orderId,
      method: dto.method, idempotencyKey: key });
  }
}

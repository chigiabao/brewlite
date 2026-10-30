import { Body, Controller, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../auth/public.js';
import { PayDto } from './payments.dto.js';
import { PaymentsService } from './payments.service.js';
import type { PaymentResult } from './payment.types.js';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  pay(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: PayDto,
  ): Promise<PaymentResult> {
    // Passport verifies JWT signature/expiry; userId must come from its validated principal.
    return this.payments.pay({
      userId: user.userId,
      orderId: dto.orderId,
      method: dto.method,
      idempotencyKey: key,
    });
  }
}

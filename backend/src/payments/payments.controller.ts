import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PayDto } from './payments.dto.js';
import { PaymentsService } from './payments.service.js';
import type { PaymentResult } from './payment.types.js';

const TEMP_USER_ID = 1;

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  pay(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: PayDto,
  ): Promise<PaymentResult> {
    return this.payments.pay({
      userId: TEMP_USER_ID,
      orderId: dto.orderId,
      method: dto.method,
      idempotencyKey: key,
    });
  }
}

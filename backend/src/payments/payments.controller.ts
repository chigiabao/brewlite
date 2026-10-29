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
    @Headers('authorization') authHeader: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: PayDto,
  ): Promise<PaymentResult> {
    let userId = TEMP_USER_ID;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7).trim();
        const payload = JSON.parse(
          Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
        );
        if (payload && typeof payload.sub === 'number') {
          userId = payload.sub;
        }
      } catch {
        // Fallback to default user if token parsing fails
      }
    }

    return this.payments.pay({
      userId,
      orderId: dto.orderId,
      method: dto.method,
      idempotencyKey: key,
    });
  }
}

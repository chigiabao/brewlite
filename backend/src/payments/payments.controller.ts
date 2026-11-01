import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { getPaymentProvider } from '../config/app-config.js';
import { PaymentError, PaymentErrorCode } from './payment.errors.js';
import { MockPaymentService } from './mock-payment.service.js';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../auth/public.js';
import { PayDto } from './payments.dto.js';
import { PaymentsService } from './payments.service.js';
import type { CreateCheckoutResult, StripeWebhookResult } from './payment.types.js';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly mockPayments: MockPaymentService,
  ) {}

  // FIX 11: API đồng bộ cho demo đúng hợp đồng POST /payments.
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.OK)
  payMock(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: PayDto,
  ) {
    if (getPaymentProvider() !== 'MOCK') {
      throw new PaymentError(PaymentErrorCode.ORDER_NOT_PAYABLE,
        'Chế độ Stripe yêu cầu POST /payments/checkout', 409);
    }
    return this.mockPayments.pay({
      userId: user.userId, orderId: dto.orderId, method: dto.method,
      idempotencyKey: key, demoDecline: dto.demoDecline === true,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  createCheckout(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: PayDto,
  ): Promise<CreateCheckoutResult> {
    if (getPaymentProvider() !== 'STRIPE') {
      throw new PaymentError(PaymentErrorCode.ORDER_NOT_PAYABLE,
        'Demo Mock yêu cầu POST /payments', 409);
    }
    if (dto.demoDecline !== undefined) {
      throw new PaymentError(PaymentErrorCode.ORDER_NOT_PAYABLE,
        'Stripe không hỗ trợ demoDecline', 400);
    }
    return this.payments.createCheckout({
      userId: user.userId,
      orderId: dto.orderId,
      method: dto.method,
      idempotencyKey: key,
    });
  }

  @SkipThrottle()
  @Post(['webhook', 'webhook/stripe'])
  @HttpCode(HttpStatus.OK)
  stripeWebhook(@Req() req: RawBodyRequest<Request>): Promise<StripeWebhookResult> {
    if (getPaymentProvider() !== 'STRIPE') {
      throw new PaymentError(PaymentErrorCode.ORDER_NOT_PAYABLE, 'Stripe webhook bị tắt trong Mock', 404);
    }
    const header = req.headers['stripe-signature'];
    const signature = Array.isArray(header) ? header[0] : header;
    return this.payments.handleStripeWebhook(req.rawBody, signature);
  }
}

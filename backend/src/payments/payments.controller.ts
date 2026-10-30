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
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../auth/public.js';
import { PayDto } from './payments.dto.js';
import { PaymentsService } from './payments.service.js';
import type { CreateCheckoutResult, StripeWebhookResult } from './payment.types.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  createCheckout(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: PayDto,
  ): Promise<CreateCheckoutResult> {
    return this.payments.createCheckout({
      userId: user.userId,
      orderId: dto.orderId,
      method: dto.method,
      idempotencyKey: key,
    });
  }

  @Post('webhook/stripe')
  @HttpCode(HttpStatus.OK)
  stripeWebhook(@Req() req: RawBodyRequest<Request>): Promise<StripeWebhookResult> {
    const header = req.headers['stripe-signature'];
    const signature = Array.isArray(header) ? header[0] : header;
    return this.payments.handleStripeWebhook(req.rawBody, signature);
  }
}

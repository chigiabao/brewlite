import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { Response } from 'express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../auth/public.js';
import { getFrontendUrl, getPaymentProvider, isMockDeclineEnabled } from '../config/app-config.js';
import { MockPayDto, PayDto } from './payments.dto.js';
import { PaymentsService } from './payments.service.js';
import { MockPaymentService } from './mock-payment.service.js';
import type {
  CreateCheckoutResult,
  StripeWebhookResult,
  VnpayIpnResponse,
} from './payment.types.js';
import type { VnpayIpnQuery } from './vnpay/vnpay.service.js';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly mockPayments: MockPaymentService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('config')
  configuration() {
    return { provider: getPaymentProvider(), mockDeclineEnabled: isMockDeclineEnabled() };
  }

  @UseGuards(JwtAuthGuard)
  @Get('vnpay/status/:txnRef')
  vnpayStatus(@CurrentUser() user: AuthUser, @Param('txnRef') txnRef: string) {
    return this.payments.getVnpayStatus(user.userId, txnRef);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.OK)
  createMockPayment(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: MockPayDto,
  ) {
    if (getPaymentProvider() !== 'MOCK') {
      throw new BadRequestException('Mock payment is disabled; use Stripe checkout');
    }

    return this.mockPayments.pay({
      userId: user.userId,
      orderId: dto.orderId,
      method: dto.method,
      idempotencyKey: key,
      demoDecline: dto.demoDecline === true,
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
    @Req() req: Request,
  ): Promise<CreateCheckoutResult> {
    const ipAddr =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1';

    return this.payments.createCheckout({
      userId: user.userId,
      orderId: dto.orderId,
      method: dto.method,
      idempotencyKey: key,
      ...(dto.method === 'VNPAY' ? { ipAddr, bankCode: dto.bankCode } : {}),
    });
  }

  @SkipThrottle()
  @Post(['webhook', 'webhook/stripe'])
  @HttpCode(HttpStatus.OK)
  stripeWebhook(@Req() req: RawBodyRequest<Request>): Promise<StripeWebhookResult> {
    if (getPaymentProvider() !== 'STRIPE') {
      throw new BadRequestException('Stripe payment is disabled; use mock payment');
    }
    const header = req.headers['stripe-signature'];
    const signature = Array.isArray(header) ? header[0] : header;
    return this.payments.handleStripeWebhook(req.rawBody, signature);
  }

  @SkipThrottle()
  @Get('vnpay/ipn')
  @HttpCode(HttpStatus.OK)
  vnpayIpnGet(@Query() query: VnpayIpnQuery): Promise<VnpayIpnResponse> {
    return this.payments.handleVnpayIpn(query);
  }

  @SkipThrottle()
  @Post('vnpay/ipn')
  @HttpCode(HttpStatus.OK)
  vnpayIpnPost(@Query() query: VnpayIpnQuery, @Body() body: VnpayIpnQuery): Promise<VnpayIpnResponse> {
    // VNPay có thể gửi params trong query hoặc trong body
    const combined = { ...body, ...query };
    return this.payments.handleVnpayIpn(combined);
  }

  /**
   * VNPay opens this URL in the customer's browser after checkout.
   * Keep the public callback on the backend, then send the browser to the
   * frontend page that renders the result. The IPN endpoint remains the
   * server-to-server source of truth for payment settlement.
   */
  @SkipThrottle()
  @Get('vnpay/return')
  vnpayReturn(@Query() query: VnpayIpnQuery, @Res() response: Response): void {
    const frontendReturnUrl = new URL(`${getFrontendUrl()}/orders/vnpay-return`);
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'string') frontendReturnUrl.searchParams.set(key, value);
    }
    response.redirect(HttpStatus.FOUND, frontendReturnUrl.toString());
  }
}

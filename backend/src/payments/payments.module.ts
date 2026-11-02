import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/public.js';
import { RewardsModule } from '../rewards/public.js';
import { MockOrdersPaymentAdapter, ORDERS_PAYMENT_PORT } from './orders-payment.port.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { MockPaymentService } from './mock-payment.service.js';
import { stripeProvider } from './stripe.provider.js';
import { VnpayService } from './vnpay/vnpay.service.js';

@Module({
  imports: [
    AuthModule,
    RewardsModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    MockPaymentService,
    VnpayService,
    stripeProvider,
    MockOrdersPaymentAdapter,
    { provide: ORDERS_PAYMENT_PORT, useExisting: MockOrdersPaymentAdapter },
  ],
  exports: [VnpayService],
})
export class PaymentsModule {}

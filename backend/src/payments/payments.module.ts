import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/public.js';
import { RewardsModule } from '../rewards/public.js';
import {
  GATEWAY_REFERENCE_GENERATOR,
  MockGatewayService,
  randomGatewayReference,
} from './mock-gateway.service.js';
import { MockOrdersPaymentAdapter, ORDERS_PAYMENT_PORT } from './orders-payment.port.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [
    AuthModule, // Own the JwtStrategy dependency even when PaymentsModule is loaded independently.
    RewardsModule, // G-02: cần REWARDS_PORT để finalizeRewardsOnPaid sau PAID
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    MockGatewayService,
    MockOrdersPaymentAdapter,
    { provide: GATEWAY_REFERENCE_GENERATOR, useValue: randomGatewayReference },
    { provide: ORDERS_PAYMENT_PORT, useExisting: MockOrdersPaymentAdapter },
  ],
})
export class PaymentsModule {}

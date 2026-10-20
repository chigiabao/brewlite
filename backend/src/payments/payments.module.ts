import { Module } from '@nestjs/common';
import {
  GATEWAY_REFERENCE_GENERATOR,
  MockGatewayService,
  randomGatewayReference,
} from './mock-gateway.service.js';
import { MockOrdersPaymentAdapter, ORDERS_PAYMENT_PORT } from './orders-payment.port.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
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

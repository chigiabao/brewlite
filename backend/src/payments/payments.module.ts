import { Module } from '@nestjs/common';
import { MockGatewayService } from './mock-gateway.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, MockGatewayService],
})
export class PaymentsModule {}

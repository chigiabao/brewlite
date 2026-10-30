// import { Module } from '@nestjs/common';
// import { OrdersController } from './orders.controller.js';
// @Module({
//   controllers: [OrdersController],
//   providers: [OrdersService],
//   exports: [OrdersService],
// })
// export class OrdersModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/public.js';
import { RewardsModule } from '../rewards/public.js';
import { OrdersController } from './orders.controller.js';
import { OrderExpiryService } from './order-expiry.service.js';
import { OrdersService } from './orders.service.js';
import { StockService } from './stock.service.js';

@Module({
  imports: [AuthModule, RewardsModule],
  controllers: [OrdersController],
  providers: [OrdersService, StockService, OrderExpiryService],
  exports: [OrdersService, StockService],
})
export class OrdersModule {}

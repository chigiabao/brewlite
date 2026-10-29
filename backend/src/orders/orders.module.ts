// import { Module } from '@nestjs/common';
// import { OrdersController } from './orders.controller.js';
// import { OrdersService } from './orders.service.js';

// @Module({
//   controllers: [OrdersController],
//   providers: [OrdersService],
//   exports: [OrdersService],
// })
// export class OrdersModule {}

import { Module } from '@nestjs/common';
import { RewardsModule } from '../rewards/public.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { StockService } from './stock.service.js';

@Module({
  imports: [RewardsModule],
  controllers: [OrdersController],
  providers: [OrdersService, StockService],
  exports: [OrdersService, StockService],
})
export class OrdersModule {}

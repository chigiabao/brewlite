import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProductsModule } from './products/products.module.js';
import { RewardsModule } from './rewards/rewards.module.js';

@Module({
  imports: [PrismaModule, ProductsModule, AuthModule, OrdersModule, PaymentsModule, RewardsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

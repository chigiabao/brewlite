import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RewardsController } from './rewards.controller.js';
import { RewardsService } from './rewards.service.js';

/** Foundation AppModule đã import RewardsModule; không cần sửa AppModule. */
@Module({
  imports: [PrismaModule],
  controllers: [RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}

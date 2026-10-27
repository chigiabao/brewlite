import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RewardsController } from './rewards.controller.js';
import { REWARDS_PORT } from './rewards-port.js';
import { RewardsService } from './rewards.service.js';

/** Foundation AppModule đã import RewardsModule; không cần sửa AppModule. */
@Module({
  imports: [PrismaModule],
  controllers: [RewardsController],
  providers: [
    RewardsService,
    // G-02: Cho phép E/F inject RewardsPort qua token REWARDS_PORT
    { provide: REWARDS_PORT, useExisting: RewardsService },
  ],
  exports: [RewardsService, REWARDS_PORT],
})
export class RewardsModule {}

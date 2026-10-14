import { Module } from '@nestjs/common';
import { RewardsController } from './rewards.controller.js';
import { RewardsService } from './rewards.service.js';

/** G triển khai độc lập; tích hợp với E/F qua contract đã khóa, không sửa service của họ tùy ý. */
@Module({
  controllers: [RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}

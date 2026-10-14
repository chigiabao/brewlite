import { Body, Controller, Post } from '@nestjs/common';
import { RewardsService } from './rewards.service.js';
import { ValidateCouponDto } from './rewards.dto.js';

@Controller('coupons')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Post('validate')
  validate(@Body() dto: ValidateCouponDto) {
    return this.rewards.validateCoupon(dto);
  }
}

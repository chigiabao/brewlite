import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../auth/public.js';
import { ValidateCouponDto } from './rewards.dto.js';
import { RewardsService } from './rewards.service.js';

@Controller()
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  /** Public preview: HTTP 200 hoặc 400/404; không tác động DB. */
  @Post('coupons/validate')
  @HttpCode(HttpStatus.OK)
  validateCoupon(@Body() dto: ValidateCouponDto) {
    return this.rewards.validateCoupon(dto);
  }

  /** Lấy balance từ JWT, không tin userId do frontend tự truyền. */
  @UseGuards(JwtAuthGuard)
  @Get('rewards/me')
  balance(@CurrentUser() user: AuthUser) {
    return this.rewards.getBalance(user.userId);
  }
}

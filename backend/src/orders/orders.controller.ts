import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../auth/public.js';
import { CreateOrderDto } from './orders.dto.js';
import { OrdersService, assertCreateKey } from './orders.service.js';

/** G-03: tuyệt đối không dùng TEMP_USER_ID hoặc userId từ body. */
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateOrderDto) {
    return this.orders.create(user.userId, dto, assertCreateKey(key));
  }

  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.orders.findMine(user.userId);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) orderId: number) {
    return this.orders.cancel(user.userId, orderId);
  }
}

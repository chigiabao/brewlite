import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CreateOrderDto } from './orders.dto.js';
import { OrdersService } from './orders.service.js';
import { JwtAuthGuard, CurrentUser, type AuthUser } from '../auth/public.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orders.create(user.userId, dto, idempotencyKey);
  }

  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.orders.findMine(user.userId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.findOne(user.userId, id);
  }
}

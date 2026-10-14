import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateOrderDto } from './orders.dto.js';
import { OrdersService } from './orders.service.js';

// TODO(D – Task 7): khi JwtStrategy xong, thêm @UseGuards(JwtAuthGuard) cho controller
// và lấy user bằng @CurrentUser() thay cho userId tạm.
const TEMP_USER_ID = 1;

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // Người phụ trách: E (Task 6)
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(TEMP_USER_ID, dto);
  }

  // Người phụ trách: E (Task 9)
  @Get('me')
  mine() {
    return this.orders.findMine(TEMP_USER_ID);
  }
}

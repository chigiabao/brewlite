import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AdminService } from './admin.service.js';
import {
  AdjustUserPointsDto,
  CreateCouponDto,
  CreateProductDto,
  UpdateCouponDto,
  UpdateOrderStatusDto,
  UpdateProductDto,
  UpdateStockDto,
} from './admin.dto.js';

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // 1. Thống kê & Tổng quan Dashboard
  @Get('stats')
  getStats() {
    return this.admin.getDashboardStats();
  }

  // 2. Quản lý Đơn hàng
  @Get('orders')
  getOrders(
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.admin.getOrders(status, search);
  }

  @Patch('orders/:id/status')
  updateOrderStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.admin.updateOrderStatus(id, dto.status);
  }

  // 3. Quản lý Sản phẩm & Kho hàng
  @Get('products')
  getProducts() {
    return this.admin.getProducts();
  }

  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.admin.createProduct(dto);
  }

  @Put('products/:id')
  updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ) {
    return this.admin.updateProduct(id, dto);
  }

  @Patch('products/:id/stock')
  updateStock(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStockDto,
  ) {
    return this.admin.updateStock(id, dto);
  }

  @Delete('products/:id')
  deleteProduct(@Param('id', ParseIntPipe) id: number) {
    return this.admin.deleteProduct(id);
  }

  // 4. Quản lý Mã khuyến mãi (Coupons)
  @Get('coupons')
  getCoupons() {
    return this.admin.getCoupons();
  }

  @Post('coupons')
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.admin.createCoupon(dto);
  }

  @Patch('coupons/:code')
  updateCoupon(
    @Param('code') code: string,
    @Body() dto: UpdateCouponDto,
  ) {
    return this.admin.updateCoupon(code, dto);
  }

  @Delete('coupons/:code')
  deleteCoupon(@Param('code') code: string) {
    return this.admin.deleteCoupon(code);
  }

  // 5. Quản lý Khách hàng & Điểm thưởng
  @Get('users')
  getUsers() {
    return this.admin.getUsers();
  }

  @Patch('users/:id/points')
  adjustUserPoints(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustUserPointsDto,
  ) {
    return this.admin.adjustUserPoints(id, dto.pointsDelta);
  }
}

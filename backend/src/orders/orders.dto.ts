import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

// Hợp đồng dữ liệu giỏ hàng gửi từ frontend (thống nhất giữa D và E).
// Không nhận giá từ client: server tự tính lại bằng common/pricing.ts.
export class OrderItemDto {
  @IsInt()
  productId: number;

  @IsIn(['S', 'M', 'L'])
  size: 'S' | 'M' | 'L';

  @IsArray()
  @IsString({ each: true })
  toppings: string[];

  @IsInt()
  @Min(1)
  qty: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  // Task 10 – G: mã giảm giá (không bắt buộc)
  @IsOptional()
  @IsString()
  couponCode?: string;
}

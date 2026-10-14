import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn,
  IsInt, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';

/** C phụ trách request giỏ; E sở hữu DTO đặt hàng. Chỉ truyền ID/tùy chọn, không truyền giá. */
export class OrderItemDto {
  @IsInt()
  @Min(1)
  productId: number;

  @IsIn(['S', 'M', 'L'])
  size: 'S' | 'M' | 'L';

  @IsArray()
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsIn(['Trân châu', 'Kem'], { each: true })
  toppings: ('Trân châu' | 'Kem')[];

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

  @IsOptional()
  @IsString()
  couponCode?: string;

  // Đã thống nhất: điểm chỉ trừ khi order PAID, không trừ ở bước validate.
  @IsOptional()
  @IsInt()
  @Min(0)
  pointsToRedeem?: number;
}

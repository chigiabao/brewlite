import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { OrderStatus } from '../generated/prisma/enums.js';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus, { message: 'Trạng thái đơn hàng không hợp lệ' })
  status!: OrderStatus;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên sản phẩm không được để trống' })
  name!: string;

  @IsInt()
  @Min(0, { message: 'Giá sản phẩm phải lớn hơn hoặc bằng 0' })
  price!: number;

  @IsString()
  @IsNotEmpty({ message: 'Đường dẫn ảnh sản phẩm không được để trống' })
  imageUrl!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
}

export class UpdateStockDto {
  @IsOptional()
  @IsInt()
  stock?: number;

  @IsOptional()
  @IsInt()
  delta?: number;
}

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty({ message: 'Mã voucher không được để trống' })
  code!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  discountPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderValue?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateCouponDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  discountPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderValue?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class AdjustUserPointsDto {
  @IsInt()
  pointsDelta!: number;
}

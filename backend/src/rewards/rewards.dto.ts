import { IsInt, IsOptional, IsString, Min } from 'class-validator';

// G – Contract cho báo giá coupon. Frontend chỉ xem trước; E sẽ tính lại khi tạo đơn.
export class ValidateCouponDto {
  @IsString()
  code: string;

  @IsInt()
  @Min(0)
  orderTotal: number;
}

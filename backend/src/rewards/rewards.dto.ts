import { Transform } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { normalizeCouponCode } from './reward-rules.js';

/** Body POST /coupons/validate; chỉ là preview, không tiêu quota. */
export class ValidateCouponDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeCouponCode(value) : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  // Client gửi subtotal để xem trước; lúc tạo order, E PHẢI tính lại từ DB.
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  orderTotal!: number;
}

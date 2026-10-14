import { IsIn, IsInt, Min } from 'class-validator';

/** F sở hữu phương thức thanh toán; không nhận số tiền từ frontend. */
export class PayDto {
  @IsInt()
  @Min(1)
  orderId: number;

  @IsIn(['WALLET', 'CARD'])
  method: 'WALLET' | 'CARD';
}

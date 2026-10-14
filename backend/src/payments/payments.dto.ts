import { IsIn, IsInt } from 'class-validator';

export class PayDto {
  @IsInt()
  orderId: number;

  @IsIn(['WALLET', 'CARD'])
  method: 'WALLET' | 'CARD';
}

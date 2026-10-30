import { IsIn, IsInt, Min } from 'class-validator';

export const PAYMENT_METHODS = ['WALLET', 'CARD'] as const;
export type PaymentMethodInput = (typeof PAYMENT_METHODS)[number];

export class PayDto {
  @IsInt()
  @Min(1)
  orderId!: number;

  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethodInput;
}

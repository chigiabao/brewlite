import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export const PAYMENT_METHODS = ['WALLET', 'CARD'] as const;
export type PaymentMethodInput = (typeof PAYMENT_METHODS)[number];

export class PayDto {
  @IsInt()
  @Min(1)
  orderId!: number;

  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethodInput;

  /** Chỉ cho phép trong local test mode; không có hiệu lực trên production. */
  @IsOptional()
  @IsBoolean()
  demoDecline?: boolean;
}

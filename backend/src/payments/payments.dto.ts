import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export const PAYMENT_METHODS = ['WALLET', 'CARD'] as const;
export type PaymentMethodInput = (typeof PAYMENT_METHODS)[number];

export class PayDto {
  @IsInt()
  @Min(1)
  orderId!: number;

  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethodInput;

  // FIX 11: chỉ có ý nghĩa ở Mock local, không dùng trong Stripe production.
  @IsOptional()
  @IsBoolean()
  demoDecline?: boolean;
}

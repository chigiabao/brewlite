import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const PAYMENT_METHODS = ['WALLET', 'CARD', 'VNPAY'] as const;
export type PaymentMethodInput = (typeof PAYMENT_METHODS)[number];

export class PayDto {
  @IsInt()
  @Min(1)
  orderId!: number;

  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethodInput;

  @IsOptional()
  @IsString()
  bankCode?: string;
}

export class MockPayDto extends PayDto {
  @IsOptional()
  @IsBoolean()
  demoDecline?: boolean;
}

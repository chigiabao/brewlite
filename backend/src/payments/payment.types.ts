import type { OrderStatus, PaymentMethod, PaymentStatus } from '../generated/prisma/enums.js';

export type PayInput = {
  userId: number;
  orderId: number;
  method: PaymentMethod;
  idempotencyKey: string | undefined;
  demoDecline?: boolean;
};

export type PaymentResult = {
  orderId: number;
  paymentId: number;
  status: PaymentStatus;
  orderStatus: OrderStatus;
  method: PaymentMethod;
  amount: number;
  transactionId: string | null;
  idempotentReplay: boolean;
};

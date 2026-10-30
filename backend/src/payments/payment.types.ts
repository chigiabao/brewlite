export type PaymentStatusValue = 'PENDING' | 'SUCCEEDED' | 'FAILED';

export type PayInput = {
  userId: number;
  orderId: number;
  method: 'WALLET' | 'CARD';
  idempotencyKey: string | undefined;
};


export type CreateCheckoutResult = {
  orderId: number;
  paymentId: number;
  status: PaymentStatusValue;
  checkoutUrl: string;
  idempotentReplay: boolean;
};

export type StripeWebhookResult = {
  received: true;
  type?: string;
  orderId?: number;
  ignored?: string;
  replay?: boolean;
};

export type PaymentStatusValue = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';

export type PayInput = {
  userId: number;
  orderId: number;
  method: 'WALLET' | 'CARD' | 'VNPAY';
  idempotencyKey: string | undefined;
  ipAddr?: string;
  bankCode?: string;
};

export type VnpayIpnResponse = {
  RspCode: string;
  Message: string;
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

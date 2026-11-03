import type { CheckoutMethod } from './checkout-session';

export type PaymentConfig = { provider: 'MOCK' | 'STRIPE'; mockDeclineEnabled: boolean };
export type PaymentProvider = PaymentConfig['provider'] | 'VNPAY';

export function paymentProvider(config: PaymentConfig, method: CheckoutMethod): PaymentProvider {
  return method === 'VNPAY' ? 'VNPAY' : config.provider;
}

export function paymentRequest(
  provider: PaymentProvider,
  orderId: number,
  method: CheckoutMethod,
  demoDecline: boolean,
): { path: string; body: string } {
  return {
    path: provider === 'MOCK' ? '/payments' : '/payments/checkout',
    body: JSON.stringify({ orderId, method, ...(provider === 'MOCK' && demoDecline ? { demoDecline: true } : {}) }),
  };
}

export function validCheckoutUrl(value: unknown, provider: PaymentProvider): value is string {
  if (typeof value !== 'string' || provider === 'MOCK') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (provider === 'VNPAY' || url.hostname === 'checkout.stripe.com');
  } catch {
    return false;
  }
}

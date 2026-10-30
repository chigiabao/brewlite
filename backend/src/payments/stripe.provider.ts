import Stripe from 'stripe';

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

export const stripeProvider = {
  provide: STRIPE_CLIENT,
  useFactory: (): Stripe => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    return new Stripe(key);
  },
};
import Stripe from 'stripe';
import { getPaymentProvider } from '../config/app-config.js';

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

export const stripeProvider = {
  provide: STRIPE_CLIENT,
  useFactory: (): Stripe => {
    // FIX 11: Mock không gọi Stripe; không yêu cầu API key khi demo offline.
    // Route Stripe bị từ chối ở controller khi chế độ MOCK.
    if (getPaymentProvider() === 'MOCK') return new Stripe('sk_test_mock_disabled');
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    return new Stripe(key);
  },
};
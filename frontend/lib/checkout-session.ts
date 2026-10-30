/** FIX07 — Dữ liệu tiếp tục checkout cùng tab sau reload (không lưu JWT hoặc thông tin thẻ). */
export type CheckoutMethod = 'WALLET' | 'CARD';
export type CheckoutItem = {
  productId: number;
  size: 'S' | 'M' | 'L';
  toppings: string[];
  qty: number;
};
export type CheckoutOrderRequest = {
  items: CheckoutItem[];
  couponCode?: string;
  pointsToRedeem: number;
};
export type CheckoutAttempt = {
  key: string;
  method: CheckoutMethod;
  demoDecline: boolean;
};
export type CheckoutSession = {
  version: 1;
  subject: string;
  cartKey: string;
  orderKey: string;
  orderRequest: CheckoutOrderRequest;
  orderId: number | null;
  orderTotal: number | null;
  pointsRedeemed: number | null;
  attempt: CheckoutAttempt | null;
};

export const CHECKOUT_SESSION_KEY = 'brewlite-checkout-v1';

/** Chỉ dùng claim sub để cách ly dữ liệu UI. Không dùng để xác thực: backend luôn xác minh JWT. */
export function jwtSubject(token: string | null): string | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: unknown };
    const sub = payload.sub;
    if (typeof sub !== 'number' && typeof sub !== 'string') return null;
    const value = String(sub);
    return /^\d+$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function loadCheckoutSession(token: string | null): CheckoutSession | null {
  const subject = jwtSubject(token);
  if (!subject || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CHECKOUT_SESSION_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Partial<CheckoutSession>;
    if (obj.subject !== subject) return null; // không mở đơn của user khác
    if (obj.version !== 1 || typeof obj.cartKey !== 'string' ||
        typeof obj.orderKey !== 'string' || !obj.orderKey || !obj.orderRequest ||
        !Array.isArray(obj.orderRequest.items) || (!Number.isSafeInteger(obj.orderRequest.pointsToRedeem) || obj.orderRequest.pointsToRedeem < 0) ||
        (obj.orderId !== null && (!Number.isSafeInteger(obj.orderId) || (obj.orderId ?? 0) <= 0)) ||
        (obj.orderTotal !== null && (!Number.isSafeInteger(obj.orderTotal) || (obj.orderTotal ?? -1) < 0)) ||
        (obj.pointsRedeemed !== null && (!Number.isSafeInteger(obj.pointsRedeemed) || (obj.pointsRedeemed ?? -1) < 0)) ||
        (obj.attempt !== null && (!obj.attempt || typeof obj.attempt.key !== 'string' || !obj.attempt.key ||
          !['WALLET', 'CARD'].includes(obj.attempt.method) || typeof obj.attempt.demoDecline !== 'boolean'))) {
      return null;
    }
    return obj as CheckoutSession;
  } catch {
    return null;
  }
}

export function saveCheckoutSession(session: CheckoutSession): void {
  sessionStorage.setItem(CHECKOUT_SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event('brewlite-checkout-session')); 
}

export function clearCheckoutSession(): void {
  sessionStorage.removeItem(CHECKOUT_SESSION_KEY);
  window.dispatchEvent(new Event('brewlite-checkout-session'));
}

export function isPaidOrderStatus(status: string): boolean {
  return ['PAID', 'PREPARING', 'READY', 'COMPLETED'].includes(status);
}

export function isDefinitivePaymentFailure(status: number | undefined, code: string | undefined): boolean {
  return (status === 402 && code === 'PAYMENT_DECLINED') ||
    (status === 504 && code === 'GATEWAY_TIMEOUT');
}

export type CheckoutMethod = 'WALLET' | 'CARD';

export type CheckoutAttempt = {
  cartKey: string;
  orderKey: string;
  paymentKey: string | null;
  orderId: number | null;
  method: CheckoutMethod | null;
};

const STORAGE_KEY = 'brewlite-checkout-attempt';

export function cartKeyFor(
  items: Array<{
    productId: number;
    size: string;
    toppings: string[];
    qty: number;
  }>,
): string {
  return JSON.stringify(
    items.map(({ productId, size, toppings, qty }) => ({
      productId,
      size,
      toppings: [...toppings].sort(),
      qty,
    })),
  );
}

export function loadAttempt(cartKey: string): CheckoutAttempt | null {
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const attempt = JSON.parse(raw) as CheckoutAttempt;
    if (
      attempt.cartKey !== cartKey ||
      !attempt.orderKey ||
      (attempt.orderId !== null && !Number.isSafeInteger(attempt.orderId))
    ) {
      clearAttempt();
      return null;
    }
    return attempt;
  } catch {
    clearAttempt();
    return null;
  }
}

export function saveAttempt(attempt: CheckoutAttempt): void {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attempt));
}

export function clearAttempt(): void {
  window.sessionStorage.removeItem(STORAGE_KEY);
}

export function newAttempt(cartKey: string): CheckoutAttempt {
  return {
    cartKey,
    orderKey: crypto.randomUUID(),
    paymentKey: null,
    orderId: null,
    method: null,
  };
}

export function startPaymentAttempt(
  attempt: CheckoutAttempt,
  method: CheckoutMethod,
): CheckoutAttempt {
  if (attempt.paymentKey) return attempt;

  return {
    ...attempt,
    paymentKey: crypto.randomUUID(),
    method,
  };
}

export function rotatePaymentAttempt(attempt: CheckoutAttempt): CheckoutAttempt {
  return { ...attempt, paymentKey: null, method: null };
}

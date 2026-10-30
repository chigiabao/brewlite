const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type CheckoutApiErrorBody = {
  statusCode?: number;
  code?: string;
  message?: string | string[];
  retryable?: boolean;
};

export class CheckoutApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'CheckoutApiError';
  }
}

export type CreateOrderRequest = {
  items: Array<{
    productId: number;
    size: 'S' | 'M' | 'L';
    toppings: string[];
    qty: number;
  }>;
  couponCode?: string;
  pointsToRedeem?: number;
};

export type CreatedOrder = {
  id: number;
  status: string;
  total: number;
};

export type CreateCheckoutResult = {
  orderId: number;
  paymentId: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
  checkoutUrl: string;
  idempotentReplay: boolean;
};

export type CheckoutMethod = 'WALLET' | 'CARD';

export async function createOrder(
  input: CreateOrderRequest,
  idempotencyKey: string,
): Promise<CreatedOrder> {
  return request<CreatedOrder>('/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export async function createCheckout(
  orderId: number,
  method: CheckoutMethod,
  idempotencyKey: string,
): Promise<CreateCheckoutResult> {
  return request<CreateCheckoutResult>('/payments/checkout', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ orderId, method }),
  });
}

function errorMessage(body: CheckoutApiErrorBody, status: number): string {
  if (Array.isArray(body.message)) return body.message.join(', ');
  return body.message ?? `Lỗi ${status}`;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const token = typeof window === 'undefined' ? null : localStorage.getItem('token');
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as CheckoutApiErrorBody;
    throw new CheckoutApiError(
      response.status,
      body.code,
      errorMessage(body, response.status),
      body.retryable === true,
    );
  }

  return response.json() as Promise<T>;
}

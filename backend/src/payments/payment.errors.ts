import { HttpException } from '@nestjs/common';

export const PaymentErrorCode = {
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  INVALID_IDEMPOTENCY_KEY: 'INVALID_IDEMPOTENCY_KEY',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ORDER_NOT_PAYABLE: 'ORDER_NOT_PAYABLE',
  ORDER_ALREADY_PAID: 'ORDER_ALREADY_PAID',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  PAYMENT_IN_PROGRESS: 'PAYMENT_IN_PROGRESS',
  PAYMENT_DECLINED: 'PAYMENT_DECLINED',
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
  PAYMENT_INTERNAL_ERROR: 'PAYMENT_INTERNAL_ERROR',
  PAYMENT_RECONCILIATION_REQUIRED: 'PAYMENT_RECONCILIATION_REQUIRED',
} as const;

export type PaymentErrorCode = (typeof PaymentErrorCode)[keyof typeof PaymentErrorCode];

export type PaymentErrorBody = {
  statusCode: number;
  code: PaymentErrorCode;
  message: string;
};

export class PaymentError extends HttpException {
  readonly code: PaymentErrorCode;

  constructor(
    code: PaymentErrorCode,
    message: string,
    status: number,
    extra: Record<string, unknown> = {},
  ) {
    super({ statusCode: status, code, message, ...extra } satisfies PaymentErrorBody, status);
    this.code = code;
  }
}

export class PaymentDeclinedError extends Error {
  readonly code = PaymentErrorCode.PAYMENT_DECLINED;

  constructor(readonly reference: string) {
    super(`Thanh toán bị từ chối (reference=${reference})`);
    this.name = 'PaymentDeclinedError';
  }
}

export class GatewayTimeoutError extends Error {
  readonly code = PaymentErrorCode.GATEWAY_TIMEOUT;

  constructor(message = 'Mock gateway timeout') {
    super(message);
    this.name = 'GatewayTimeoutError';
  }
}

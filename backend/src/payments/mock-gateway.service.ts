import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { GatewayTimeoutError, PaymentDeclinedError } from './payment.errors.js';

export const GATEWAY_REFERENCE_GENERATOR = Symbol('GATEWAY_REFERENCE_GENERATOR');

export const MOCK_GATEWAY_LATENCY_MS = Symbol('MOCK_GATEWAY_LATENCY_MS');

export interface GatewayReferenceGenerator {
  next(): string;
}

export const randomGatewayReference: GatewayReferenceGenerator = {
  next: () => `MOCK-${randomBytes(6).toString('hex').toUpperCase()}`,
};

export type MockChargeInput = {
  paymentId: number;
  orderId: number;
  amount: number;
  method: 'WALLET' | 'CARD';
  ref?: string;
};

export type MockChargeResult = {
  reference: string;
  status: 'SUCCEEDED';
};

@Injectable()
export class MockGatewayService {
  private readonly logger = new Logger(MockGatewayService.name);

  constructor(
    @Optional()
    @Inject(GATEWAY_REFERENCE_GENERATOR)
    private readonly generator: GatewayReferenceGenerator = randomGatewayReference,
    @Optional()
    @Inject(MOCK_GATEWAY_LATENCY_MS)
    private readonly latencyMs: number = Number(process.env.MOCK_GATEWAY_LATENCY_MS ?? 300),
  ) {}

  async charge(input: MockChargeInput): Promise<MockChargeResult> {
    await this.simulateLatency();

    const reference = input.ref ?? this.forcedReference() ?? this.generator.next();

    if (reference.includes('TIMEOUT')) {
      this.logger.warn(
        `payment.gateway.timeout orderId=${input.orderId} paymentId=${input.paymentId} reference=${reference}`,
      );
      throw new GatewayTimeoutError(`Mock gateway timeout (reference=${reference})`);
    }

    if (reference.endsWith('0000')) {
      this.logger.warn(
        `payment.gateway.declined orderId=${input.orderId} paymentId=${input.paymentId} reference=${reference}`,
      );
      throw new PaymentDeclinedError(reference);
    }

    this.logger.log(
      `payment.gateway.succeeded orderId=${input.orderId} paymentId=${input.paymentId} reference=${reference}`,
    );
    return { reference, status: 'SUCCEEDED' };
  }

  private forcedReference(): string | undefined {
    if (process.env.MOCK_GATEWAY_TEST_MODE !== 'true') return undefined;
    return process.env.MOCK_GATEWAY_FORCE_REF || undefined;
  }

  private simulateLatency(): Promise<void> {
    if (!this.latencyMs || this.latencyMs <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, this.latencyMs));
  }
}

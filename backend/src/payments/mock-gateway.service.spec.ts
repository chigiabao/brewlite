import { describe, expect, it } from 'vitest';
import { GatewayTimeoutError, PaymentDeclinedError } from './payment.errors.js';
import { MockGatewayService } from './mock-gateway.service.js';

const input = { paymentId: 1, orderId: 2, amount: 85_000, method: 'WALLET' as const };

describe('MockGatewayService', () => {
  it('reference không kết thúc 0000 -> success', async () => {
    const gateway = new MockGatewayService({ next: () => 'MOCK-ABC123' }, 0);

    await expect(gateway.charge(input)).resolves.toEqual({
      reference: 'MOCK-ABC123',
      status: 'SUCCEEDED',
    });
  });

  it('reference kết thúc 0000 -> declined', async () => {
    const gateway = new MockGatewayService({ next: () => 'MOCK-ABC0000' }, 0);

    await expect(gateway.charge(input)).rejects.toBeInstanceOf(PaymentDeclinedError);
  });

  it('test hook reference chứa TIMEOUT -> GatewayTimeoutError', async () => {
    const gateway = new MockGatewayService({ next: () => 'MOCK-TIMEOUT' }, 0);

    await expect(gateway.charge(input)).rejects.toBeInstanceOf(GatewayTimeoutError);
  });

  it('latency hook = 0 -> test chạy nhanh, không flaky', async () => {
    const gateway = new MockGatewayService({ next: () => 'MOCK-OK' }, 0);

    const startedAt = Date.now();
    await gateway.charge(input);

    expect(Date.now() - startedAt).toBeLessThan(50);
  });
});

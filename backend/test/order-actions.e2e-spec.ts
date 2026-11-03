/** HTTP wiring/auth tests without a database; lifecycle/rollback is covered by OrdersService tests. */
import { ConflictException, type INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { getJwtSecret, JwtStrategy } from '../src/auth/jwt.strategy.js';
import { OrdersController } from '../src/orders/orders.controller.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PaymentsController } from '../src/payments/payments.controller.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { MockPaymentService } from '../src/payments/mock-payment.service.js';

describe('Customer order actions HTTP', () => {
  let app: INestApplication;
  let token: string;
  const cancel = vi.fn();
  const pay = vi.fn();
  const createCheckout = vi.fn();
  const getVnpayStatus = vi.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: getJwtSecret() })],
      controllers: [OrdersController, PaymentsController],
      providers: [JwtStrategy, JwtAuthGuard,
        { provide: OrdersService, useValue: { cancel } },
        { provide: PaymentsService, useValue: { createCheckout, getVnpayStatus } },
        { provide: MockPaymentService, useValue: { pay } }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    token = module.get(JwtService).sign({ sub: 7, email: 'actions@example.test' });
  });
  beforeEach(() => { vi.resetAllMocks(); });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });

  it('requires authentication for cancel and payment configuration', async () => {
    await request(app.getHttpServer()).post('/orders/42/cancel').expect(401);
    await request(app.getHttpServer()).get('/payments/config').expect(401);
    await request(app.getHttpServer()).get('/payments/vnpay/status/42_1_123').expect(401);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('reads VNPay status for the authenticated owner without trusting return query codes', async () => {
    getVnpayStatus.mockResolvedValue({ orderId: 42, orderStatus: 'PENDING', paymentStatus: 'PENDING' });
    await request(app.getHttpServer()).get('/payments/vnpay/status/42_1_123?vnp_ResponseCode=00&vnp_TransactionStatus=00')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { orderId: 42, orderStatus: 'PENDING', paymentStatus: 'PENDING' });
    expect(getVnpayStatus).toHaveBeenCalledWith(7, '42_1_123');
  });

  it('uses the JWT owner and rejects invalid order IDs before calling cancellation', async () => {
    cancel.mockResolvedValue({ id: 42, status: 'CANCELLED' });
    await request(app.getHttpServer()).post('/orders/42/cancel')
      .set('Authorization', `Bearer ${token}`).expect(200, { id: 42, status: 'CANCELLED' });
    expect(cancel).toHaveBeenCalledWith(7, 42);
    await request(app.getHttpServer()).post('/orders/invalid/cancel')
      .set('Authorization', `Bearer ${token}`).expect(400);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('preserves ownership errors and payment-in-progress conflicts from the service', async () => {
    cancel.mockRejectedValueOnce(new NotFoundException('ORDER_NOT_FOUND'));
    await request(app.getHttpServer()).post('/orders/42/cancel')
      .set('Authorization', `Bearer ${token}`).expect(404);
    cancel.mockRejectedValueOnce(new ConflictException('ORDER_PAYMENT_IN_PROGRESS'));
    await request(app.getHttpServer()).post('/orders/42/cancel')
      .set('Authorization', `Bearer ${token}`).expect(409);
  });

  it('exposes only the configured provider and available demo option', async () => {
    vi.stubEnv('PAYMENT_PROVIDER', 'MOCK');
    vi.stubEnv('MOCK_GATEWAY_TEST_MODE', 'true');
    await request(app.getHttpServer()).get('/payments/config')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { provider: 'MOCK', mockDeclineEnabled: true });
    vi.stubEnv('PAYMENT_PROVIDER', 'STRIPE');
    await request(app.getHttpServer()).get('/payments/config')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { provider: 'STRIPE', mockDeclineEnabled: false });
  });

  it('sends resume payment to the existing order with the caller key and no client amount', async () => {
    vi.stubEnv('PAYMENT_PROVIDER', 'MOCK');
    pay.mockResolvedValue({ orderId: 42, status: 'SUCCEEDED', orderStatus: 'PAID' });
    await request(app.getHttpServer()).post('/payments')
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'resume-42')
      .send({ orderId: 42, method: 'WALLET' }).expect(200);
    expect(pay).toHaveBeenCalledWith({ userId: 7, orderId: 42, method: 'WALLET',
      idempotencyKey: 'resume-42', demoDecline: false });
    await request(app.getHttpServer()).post('/payments')
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'resume-42')
      .send({ orderId: 42, method: 'WALLET', total: 1 }).expect(400);
    expect(pay).toHaveBeenCalledTimes(1);
  });
});

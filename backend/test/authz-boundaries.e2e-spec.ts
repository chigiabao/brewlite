/**
 * Guard regression tests for the REAL OrdersController and PaymentsController.
 * Services are mocked, but Passport JwtStrategy, JwtAuthGuard, @CurrentUser and
 * HTTP routing are not mocked. No running PostgreSQL instance is required.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthModule } from '../src/auth/auth.module.js';
import { OrdersController } from '../src/orders/orders.controller.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PaymentsController } from '../src/payments/payments.controller.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RewardsController } from '../src/rewards/rewards.controller.js';
import { RewardsService } from '../src/rewards/rewards.service.js';

const paymentService = { pay: vi.fn(async (input: unknown) => input) };
const ordersService = {
  create: vi.fn(async (userId: number) => ({ userId })),
  findMine: vi.fn(async (userId: number) => [{ userId }]),
  findOne: vi.fn(async (userId: number, orderId: number) => ({ userId, orderId })),
};

const rewardsService = {
  getBalance: vi.fn(async (userId: number) => ({ userId, loyaltyPoints: 17 })),
  validateCoupon: vi.fn(async () => ({ valid: true, discount: 1000 })),
};

const orderBody = { items: [{ productId: 3, size: 'M', toppings: [], qty: 1 }] };
const paymentBody = { orderId: 123, method: 'WALLET' };

describe('Actual Payments / Orders JWT authorization boundary (HTTP)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let previousSecret: string | undefined;

  beforeAll(async () => {
    previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'brewlite-authz-http-regression-secret-long-enough';
    const fixture = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
      controllers: [PaymentsController, OrdersController, RewardsController],
      providers: [
        { provide: PaymentsService, useValue: paymentService },
        { provide: OrdersService, useValue: ordersService },
        { provide: RewardsService, useValue: rewardsService },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    jwt = app.get(JwtService);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  function token(sub = 42) {
    return jwt.sign({ sub, email: 'authorized@brewlite.test' });
  }

  function expectNoBusinessCalls() {
    expect(paymentService.pay).not.toHaveBeenCalled();
    expect(ordersService.create).not.toHaveBeenCalled();
    expect(ordersService.findMine).not.toHaveBeenCalled();
    expect(ordersService.findOne).not.toHaveBeenCalled();
    expect(rewardsService.getBalance).not.toHaveBeenCalled();
  }

  it('rejects unauthenticated POST /payments with 401 before calling service', async () => {
    await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', 'missing-auth-1')
      .send(paymentBody)
      .expect(401);
    expectNoBusinessCalls();
  });

  it('rejects a forged signed payload (wrong JWT secret)', async () => {
    const forged = jwt.sign(
      { sub: 42, email: 'authorized@brewlite.test' },
      { secret: 'attacker-controlled-signature' },
    );
    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${forged}`)
      .set('Idempotency-Key', 'forged-auth-1')
      .send(paymentBody)
      .expect(401);
    expectNoBusinessCalls();
  });

  it('rejects invalid and expired JWTs before calling payment service', async () => {
    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', 'Bearer a.b.c')
      .set('Idempotency-Key', 'malformed-auth-1')
      .send(paymentBody)
      .expect(401);
    const expired = jwt.sign(
      { sub: 42, email: 'authorized@brewlite.test' },
      { expiresIn: -1 },
    );
    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${expired}`)
      .set('Idempotency-Key', 'expired-auth-1')
      .send(paymentBody)
      .expect(401);
    expectNoBusinessCalls();
  });

  it('rejects a correctly signed JWT with an invalid user subject', async () => {
    for (const badSubject of [0, -1, '42', null]) {
      const signed = jwt.sign({ sub: badSubject, email: 'authorized@brewlite.test' });
      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${signed}`)
        .set('Idempotency-Key', 'bad-subject-1')
        .send(paymentBody)
        .expect(401);
    }
    expectNoBusinessCalls();
  });

  it('passes the verified JWT identity, NOT a fixed user 1, to PaymentsService', async () => {
    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${token(42)}`)
      .set('Idempotency-Key', 'good-auth-42')
      .send(paymentBody)
      .expect(200);
    expect(paymentService.pay).toHaveBeenCalledWith({
      userId: 42, orderId: 123, method: 'WALLET', idempotencyKey: 'good-auth-42',
    });

    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${token(63)}`)
      .set('Idempotency-Key', 'good-auth-63')
      .send(paymentBody)
      .expect(200);
    expect(paymentService.pay).toHaveBeenLastCalledWith({
      userId: 63, orderId: 123, method: 'WALLET', idempotencyKey: 'good-auth-63',
    });
  });

  it('rejects all actual Orders routes with 401 if JWT is absent', async () => {
    await request(app.getHttpServer()).get('/orders/me').expect(401);
    await request(app.getHttpServer()).get('/orders/123').expect(401);
    await request(app.getHttpServer()).post('/orders').send(orderBody).expect(401);
    expectNoBusinessCalls();
  });

  it('passes verified principal to order creation, history and detail, without user 1 fallback', async () => {
    const authorization = `Bearer ${token(51)}`;
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', authorization)
      .send(orderBody)
      .expect(201);
    expect(ordersService.create).toHaveBeenCalledWith(51, expect.any(Object), undefined);

    await request(app.getHttpServer())
      .get('/orders/me')
      .set('Authorization', authorization)
      .expect(200);
    expect(ordersService.findMine).toHaveBeenCalledWith(51);

    await request(app.getHttpServer())
      .get('/orders/123')
      .set('Authorization', authorization)
      .expect(200);
    expect(ordersService.findOne).toHaveBeenCalledWith(51, 123);
  });
  it('GET /rewards/me rejects missing, forged and expired tokens', async () => {
    await request(app.getHttpServer()).get('/rewards/me').expect(401);
    const forged = jwt.sign({ sub: 42, email: 'authorized@brewlite.test' }, { secret: 'not-our-key' });
    await request(app.getHttpServer()).get('/rewards/me')
      .set('Authorization', `Bearer ${forged}`).expect(401);
    const expired = jwt.sign({ sub: 42, email: 'authorized@brewlite.test' }, { expiresIn: -1 });
    await request(app.getHttpServer()).get('/rewards/me')
      .set('Authorization', `Bearer ${expired}`).expect(401);
    expect(rewardsService.getBalance).not.toHaveBeenCalled();
  });

  it('GET /rewards/me ignores caller-supplied userId and uses the signed identity', async () => {
    await request(app.getHttpServer()).get('/rewards/me?userId=1')
      .set('Authorization', `Bearer ${token(51)}`).expect(200);
    expect(rewardsService.getBalance).toHaveBeenCalledTimes(1);
    expect(rewardsService.getBalance).toHaveBeenCalledWith(51);
  });

  it('rejects forged JWT on actual order APIs without invoking OrdersService', async () => {
    const forged = jwt.sign({ sub: 1, email: 'fake@brewlite.test' }, { secret: 'forged-secret' });
    await request(app.getHttpServer()).post('/orders')
      .set('Authorization', `Bearer ${forged}`).set('Idempotency-Key', 'forged-order')
      .send(orderBody).expect(401);
    await request(app.getHttpServer()).get('/orders/me')
      .set('Authorization', `Bearer ${forged}`).expect(401);
    await request(app.getHttpServer()).get('/orders/123')
      .set('Authorization', `Bearer ${forged}`).expect(401);
    expectNoBusinessCalls();
  });

});

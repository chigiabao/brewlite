/**
 * HTTP fixture E2E cho Sprint 1: request thật đi qua Nest controller, DTO, ValidationPipe.
 * Prisma bị fake để không đụng DB dev. Đây KHÔNG PHẢI E2E PostgreSQL thật.
 * JwtAuthGuard được override có chủ đích; JWT crypto thực tế do owner D kiểm lại.
 */
import { INestApplication, UnauthorizedException, ValidationPipe, type ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JwtAuthGuard } from '../src/auth/public.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RewardsController } from '../src/rewards/rewards.controller.js';
import { RewardsService } from '../src/rewards/rewards.service.js';

type TestCoupon = {
  code: string; discountPercent: number | null; discountAmount: number | null;
  minOrderValue: number; maxUses: number | null; usedCount: number;
  expiresAt: Date; active: boolean;
};

const fixtures = new Map<string, TestCoupon>([
  ['GIAM10', { code: 'GIAM10', discountPercent: 10, discountAmount: null,
    minOrderValue: 50_000, maxUses: 10, usedCount: 0,
    expiresAt: new Date('2099-01-01'), active: true }],
  ['EXPIRED', { code: 'EXPIRED', discountPercent: 10, discountAmount: null,
    minOrderValue: 0, maxUses: null, usedCount: 0,
    expiresAt: new Date('2000-01-01'), active: true }],
  ['INACTIVE', { code: 'INACTIVE', discountPercent: null, discountAmount: 5_000,
    minOrderValue: 0, maxUses: null, usedCount: 0,
    expiresAt: new Date('2099-01-01'), active: false }],
  ['QUOTA', { code: 'QUOTA', discountPercent: 10, discountAmount: null,
    minOrderValue: 0, maxUses: 1, usedCount: 1,
    expiresAt: new Date('2099-01-01'), active: true }],
]);

const fakePrisma = {
  coupon: { findUnique: async ({ where }: { where: { code: string } }) => fixtures.get(where.code) ?? null },
  user: { findUnique: async ({ where }: { where: { id: number } }) =>
    where.id === 7 ? { loyaltyPoints: 5_000 } : null },
};

describe('Rewards Sprint 1 - HTTP E2E dùng fixtures', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [RewardsController],
      providers: [RewardsService, { provide: PrismaService, useValue: fakePrisma }],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest<{
          headers: { authorization?: string }; user?: { userId: number; email: string };
        }>();
        if (req.headers.authorization !== 'Bearer fixture-user-7') {
          throw new UnauthorizedException();
        }
        req.user = { userId: 7, email: 'fixture@example.test' };
        return true;
      },
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  it('valid code trả HTTP 200 + đúng discount', async () => {
    const res = await request(app.getHttpServer())
      .post('/coupons/validate').send({ code: ' giAm10 ', orderTotal: 100_000 }).expect(200);
    expect(res.body).toEqual({ valid: true, discount: 10_000 });
  });

  it.each([
    ['EXPIRED', 100_000], ['INACTIVE', 100_000], ['QUOTA', 100_000],
    ['GIAM10', 49_999],
  ])('reject %s hoặc min spend: HTTP 400', async (code, orderTotal) => {
    await request(app.getHttpServer())
      .post('/coupons/validate').send({ code, orderTotal }).expect(400);
  });

  it('coupon không tồn tại HTTP 404', async () => {
    await request(app.getHttpServer())
      .post('/coupons/validate').send({ code: 'UNKNOWN', orderTotal: 100_000 }).expect(404);
  });

  it.each([
    { code: '', orderTotal: 100_000 },
    { code: 'GIAM10', orderTotal: -1 },
    { code: 'GIAM10', orderTotal: 3.14 },
    { code: 'GIAM10', orderTotal: '100000' },
    { code: 'GIAM10', orderTotal: 100_000, unexpected: true },
  ])('DTO không hợp lệ trả HTTP 400: %j', async (body) => {
    await request(app.getHttpServer()).post('/coupons/validate').send(body).expect(400);
  });

  it('validate 2 lần không tăng usedCount (fixture)', async () => {
    const before = fixtures.get('GIAM10')!.usedCount;
    for (let i = 0; i < 2; i++) {
      await request(app.getHttpServer()).post('/coupons/validate')
        .send({ code: 'GIAM10', orderTotal: 100_000 }).expect(200);
    }
    expect(fixtures.get('GIAM10')!.usedCount).toBe(before);
  });

  it('GET /rewards/me: no token -> 401; token fixture -> 200', async () => {
    await request(app.getHttpServer()).get('/rewards/me').expect(401);
    const res = await request(app.getHttpServer()).get('/rewards/me')
      .set('Authorization', 'Bearer fixture-user-7').expect(200);
    expect(res.body).toEqual({ loyaltyPoints: 5_000 });
  });
});

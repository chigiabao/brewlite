/**
 * FIX 10 — kiểm thử HTTP trên AdminController THẬT + JWT Passport THẬT.
 * Chỉ mock Prisma và nghiệp vụ để không phụ thuộc Docker/PostgreSQL.
 * Đảm bảo request bị từ chối trước khi chạy hành động quản trị.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminRoleGuard } from '../src/admin/admin-role.guard.js';
import { AdminController } from '../src/admin/admin.controller.js';
import { AdminService } from '../src/admin/admin.service.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const db = { user: { findUnique: vi.fn() } };
const service = {
  getDashboardStats: vi.fn(async () => ({ totalOrders: 1 })),
  getOrders: vi.fn(async () => []),
  getProducts: vi.fn(async () => []),
  createProduct: vi.fn(async () => ({ id: 9 })),
  updateProduct: vi.fn(async () => ({ id: 9 })),
  updateStock: vi.fn(async () => ({ id: 9, stock: 3 })),
  deleteProduct: vi.fn(async () => ({ id: 9 })),
  getCoupons: vi.fn(async () => []),
  createCoupon: vi.fn(async () => ({ code: 'FIX10' })),
  updateCoupon: vi.fn(async () => ({ code: 'FIX10' })),
  deleteCoupon: vi.fn(async () => ({ code: 'FIX10' })),
  getUsers: vi.fn(async () => []),
  adjustUserPoints: vi.fn(async () => ({ id: 7, loyaltyPoints: 20 })),
  updateOrderStatus: vi.fn(async () => ({ id: 8, status: 'PREPARING' })),
};

describe('FIX 10 — /admin RBAC bảo vệ toàn bộ controller', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let oldSecret: string | undefined;
  let role: UserRole | null = UserRole.CUSTOMER;

  beforeAll(async () => {
    oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'brewlite-fix10-admin-http-test-signing-secret';
    const module = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
      controllers: [AdminController],
      providers: [AdminRoleGuard, { provide: AdminService, useValue: service }],
    })
      .overrideProvider(PrismaService).useValue(db)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    jwt = app.get(JwtService);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    role = UserRole.CUSTOMER;
    db.user.findUnique.mockImplementation(async () => role ? { role } : null);
  });

  afterAll(async () => {
    await app?.close();
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });

  const routes = [
    ['get', '/admin/session'], ['get', '/admin/stats'],
    ['get', '/admin/orders'], ['patch', '/admin/orders/8/status'],
    ['get', '/admin/products'], ['post', '/admin/products'],
    ['put', '/admin/products/9'], ['patch', '/admin/products/9/stock'],
    ['delete', '/admin/products/9'], ['get', '/admin/coupons'],
    ['post', '/admin/coupons'], ['patch', '/admin/coupons/FIX10'],
    ['delete', '/admin/coupons/FIX10'], ['get', '/admin/users'],
    ['patch', '/admin/users/7/points'],
  ] as const;

  function authToken(payload: Record<string, unknown> = {}) {
    return jwt.sign({ sub: 42, email: 'customer@brewlite.test', ...payload });
  }
  function noAdminSideEffects() {
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  }

  it('chặn tất cả 15 routes /admin không có token (401)', async () => {
    for (const [method, path] of routes) {
      await request(app.getHttpServer())[method](path).send({}).expect(401);
    }
    expect(db.user.findUnique).not.toHaveBeenCalled();
    noAdminSideEffects();
  });

  it('chặn tất cả routes cho JWT hợp lệ nhưng CUSTOMER (403)', async () => {
    const token = authToken();
    for (const [method, path] of routes) {
      await request(app.getHttpServer())[method](path)
        .set('Authorization', `Bearer ${token}`).send({}).expect(403);
    }
    noAdminSideEffects();
  });

  it('không tin role ADMIN tự khai trong JWT đã ký', async () => {
    await request(app.getHttpServer()).get('/admin/users')
      .set('Authorization', `Bearer ${authToken({ role: 'ADMIN', isAdmin: true })}`)
      .expect(403);
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: 42 }, select: { role: true },
    });
    noAdminSideEffects();
  });

  it('token hết hạn hoặc chữ ký giả mạo => 401', async () => {
    const expired = jwt.sign({ sub: 42, email: 'admin@brewlite.test' }, { expiresIn: -1 });
    const forged = jwt.sign({ sub: 42, email: 'admin@brewlite.test', role: 'ADMIN' }, { secret: 'wrong-secret' });
    for (const token of [expired, forged, 'broken.jwt.value']) {
      await request(app.getHttpServer()).get('/admin/stats')
        .set('Authorization', `Bearer ${token}`).expect(401);
    }
    expect(db.user.findUnique).not.toHaveBeenCalled();
    noAdminSideEffects();
  });

  it('ADMIN trong database được xem và chỉnh sửa (200/201)', async () => {
    role = UserRole.ADMIN;
    const authorization = `Bearer ${authToken({ role: 'CUSTOMER' })}`;
    const session = await request(app.getHttpServer()).get('/admin/session')
      .set('Authorization', authorization).expect(200);
    expect(session.body).toEqual({ userId: 42, email: 'customer@brewlite.test', role: 'ADMIN' });

    await request(app.getHttpServer()).get('/admin/stats').set('Authorization', authorization).expect(200);
    await request(app.getHttpServer()).post('/admin/products')
      .set('Authorization', authorization)
      .send({ name: 'Cà phê test', price: 30000, imageUrl: '/test.png', stock: 3 }).expect(201);
    await request(app.getHttpServer()).patch('/admin/users/7/points')
      .set('Authorization', authorization).send({ pointsDelta: 10 }).expect(200);
    expect(service.getDashboardStats).toHaveBeenCalledOnce();
    expect(service.createProduct).toHaveBeenCalledOnce();
    expect(service.adjustUserPoints).toHaveBeenCalledOnce();
  });

  it('thu hồi quyền hoặc xóa tài khoản có hiệu lực ngay với token cũ', async () => {
    role = UserRole.ADMIN;
    const authorization = `Bearer ${authToken()}`;
    await request(app.getHttpServer()).get('/admin/stats')
      .set('Authorization', authorization).expect(200);
    role = UserRole.CUSTOMER;
    await request(app.getHttpServer()).get('/admin/stats')
      .set('Authorization', authorization).expect(403);
    role = null;
    await request(app.getHttpServer()).get('/admin/stats')
      .set('Authorization', authorization).expect(403);
    expect(service.getDashboardStats).toHaveBeenCalledOnce();
  });
});

import {
  Body,
  Controller,
  Get,
  INestApplication,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../src/auth/public.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

interface TestOrder {
  id: number;
  userId: number;
  total: number;
  status: string;
}

const testOrders: TestOrder[] = [];

@Controller('auth-test')
@UseGuards(JwtAuthGuard)
class AuthTestController {
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  // Giả lập endpoint /orders/me thuộc Module E
  @Get('orders/me')
  findMyOrders(@CurrentUser() user: AuthUser) {
    return testOrders.filter((o) => o.userId === user.userId);
  }

  // Giả lập endpoint /orders/:id thuộc Module E
  @Get('orders/:id')
  findOrder(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    const order = testOrders.find((o) => o.id === id && o.userId === user.userId);
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng của bạn');
    }
    return order;
  }

  // Giả lập endpoint /payments thuộc Module F
  @Post('payments')
  pay(
    @Body() dto: { orderId: number; method: string },
    @CurrentUser() user: AuthUser,
  ) {
    const order = testOrders.find((o) => o.id === dto.orderId && o.userId === user.userId);
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng của bạn');
    }
    order.status = 'PAID';
    return { orderId: order.id, status: 'PAID', paidByUserId: user.userId };
  }
}

describe('Identity (e2e) — Sprint 2 & Sprint 3', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  const users: Array<{ id: number; email: string; passwordHash: string }> = [];
  const registeredEmails = new Set<string>();

  const prisma = {
    user: {
      create: vi.fn(async ({ data }: { data: { email: string; passwordHash: string } }) => {
        // Mô phỏng độ trễ I/O thực tế của DB để kiểm tra race condition
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (registeredEmails.has(data.email)) {
          throw Object.assign(new Error('Unique constraint failed on the fields: (`email`)'), {
            code: 'P2002',
          });
        }
        registeredEmails.add(data.email);
        const user = { id: users.length + 1, ...data };
        users.push(user);
        return { id: user.id, email: user.email };
      }),
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) => {
        return users.find((user) => user.email === where.email) ?? null;
      }),
    },
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
      controllers: [AuthTestController],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  let tokenUserA: string;
  let tokenUserB: string;

  describe('1. Register (POST /auth/register)', () => {
    it('returns 400 Bad Request when email format is invalid', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'secret123' })
        .expect(400);
    });

    it('returns 400 Bad Request when password has fewer than 6 characters', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'valid@example.com', password: '123' })
        .expect(400);
    });

    it('returns 400 Bad Request when password exceeds 72 characters (bcrypt limitation guard)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'valid@example.com', password: 'a'.repeat(73) })
        .expect(400);
    });

    it('returns 400 Bad Request when request contains unwhitelisted extra properties (DTO whitelist protection)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'valid-unwhitelisted@example.com',
          password: 'secret123',
          role: 'ADMIN',
          isAdmin: true,
        })
        .expect(400);

      expect(res.body.message).toEqual(expect.arrayContaining([expect.stringContaining('should not exist')]));
    });

    it('returns 201 Created and safe user info without exposing passwordHash or secrets', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com', password: 'secret123' })
        .expect(201);

      expect(res.body).toEqual({ id: 1, email: 'user@example.com' });
      expect(users[0].passwordHash).not.toBe('secret123');
      expect((res.body as { passwordHash?: string }).passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain(process.env.JWT_SECRET ?? 'brewlite');
    });

    it('returns 409 Conflict when registering with an existing email (case-insensitive)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'USER@example.com', password: 'secret123' })
        .expect(409);

      expect(res.body.message).toContain('Email đã được đăng ký');
    });

    it('xử lý đăng ký email đồng thời: chỉ 1 request thành công 201, các request còn lại 409 Conflict', async () => {
      const targetEmail = 'concurrent-signup@brewlite.test';
      const requests = Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/auth/register')
          .send({ email: targetEmail, password: 'password123' }),
      );

      const responses = await Promise.all(requests);
      const statuses = responses.map((r) => r.status);

      const successCount = statuses.filter((s) => s === 201).length;
      const conflictCount = statuses.filter((s) => s === 409).length;

      expect(successCount).toBe(1);
      expect(conflictCount).toBe(4);

      // Xác minh DB chỉ chứa đúng 1 bản ghi cho email này
      const createdUsers = users.filter((u) => u.email === targetEmail);
      expect(createdUsers).toHaveLength(1);
    });
  });

  describe('2. Login (POST /auth/login)', () => {
    it('returns 400 Bad Request when login payload violates DTO', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'invalid-email', password: '' })
        .expect(400);
    });

    it('returns 400 Bad Request when login payload contains unwhitelisted extra properties', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'secret123', extraField: 'injection' })
        .expect(400);
    });

    it('returns 201/200 and a valid JWT accessToken without exposing passwordHash or secrets', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'secret123' })
        .expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.accessToken.split('.')).toHaveLength(3);
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain(process.env.JWT_SECRET ?? 'brewlite-test');
      tokenUserA = res.body.accessToken;
    });

    it('returns 401 Unauthorized when password does not match (generic error message)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'wrong-password' })
        .expect(401);

      expect(res.body.message).toBe('Email hoặc mật khẩu không đúng');
    });

    it('returns 401 Unauthorized when email does not exist (same generic error message to prevent enumeration)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'unknown@example.com', password: 'secret123' })
        .expect(401);

      expect(res.body.message).toBe('Email hoặc mật khẩu không đúng');
    });
  });

  describe('3. Protected API Access & Token Security (JwtAuthGuard & @CurrentUser)', () => {
    it('returns 401 Unauthorized when Authorization header is missing', async () => {
      await request(app.getHttpServer()).get('/auth-test/me').expect(401);
    });

    it('returns 401 Unauthorized when Bearer token is malformed', async () => {
      await request(app.getHttpServer())
        .get('/auth-test/me')
        .set('Authorization', 'Bearer invalid-malformed-jwt')
        .expect(401);
    });

    it('returns 401 Unauthorized when token signature is signed with unknown secret', async () => {
      const badSecretToken = await jwtService.signAsync(
        { sub: 99, email: 'attacker@example.com' },
        { secret: 'wrong-fake-secret-that-fails-verification-strictly' },
      );

      await request(app.getHttpServer())
        .get('/auth-test/me')
        .set('Authorization', `Bearer ${badSecretToken}`)
        .expect(401);
    });

    it('returns 401 Unauthorized when token is expired', async () => {
      const expiredToken = await jwtService.signAsync(
        { sub: 99, email: 'expired@brewlite.test' },
        { expiresIn: '0s' },
      );
      // Chờ nhẹ 15ms để đảm bảo token quá hạn
      await new Promise((r) => setTimeout(r, 15));

      await request(app.getHttpServer())
        .get('/auth-test/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('returns 200 OK and injects AuthUser into @CurrentUser() when token is valid', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth-test/me')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(res.body).toEqual({ userId: 1, email: 'user@example.com' });
    });
  });

  describe('4. Order & Payment Ownership (User B không đọc/thanh toán order của User A)', () => {
    beforeAll(async () => {
      // Đăng ký và đăng nhập User B (userId: 3 hoặc tiếp theo)
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'userB@example.com', password: 'passwordUserB' })
        .expect(201);

      const loginB = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'userB@example.com', password: 'passwordUserB' })
        .expect(201);
      tokenUserB = loginB.body.accessToken;

      // Seed 1 order thuộc sở hữu của User A (userId: 1)
      testOrders.push({
        id: 101,
        userId: 1, // User A sở hữu
        total: 55000,
        status: 'PENDING',
      });
    });

    it('User B xem lịch sử đơn (/orders/me) không thấy đơn 101 của User A', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth-test/orders/me')
        .set('Authorization', `Bearer ${tokenUserB}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('User A xem lịch sử đơn (/orders/me) thấy đúng đơn 101 của mình', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth-test/orders/me')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(101);
      expect(res.body[0].userId).toBe(1);
    });

    it('User B cố tình đọc chi tiết đơn 101 của User A -> bị từ chối 404 ("Không tìm thấy đơn hàng của bạn")', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth-test/orders/101')
        .set('Authorization', `Bearer ${tokenUserB}`)
        .expect(404);

      expect(res.body.message).toContain('Không tìm thấy đơn hàng của bạn');
    });

    it('User A đọc chi tiết đơn 101 của mình -> thành công 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth-test/orders/101')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(res.body.id).toBe(101);
      expect(res.body.total).toBe(55000);
    });

    it('User B cố tình thanh toán đơn 101 của User A -> bị chặn 404 ("Không tìm thấy đơn hàng của bạn")', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth-test/payments')
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({ orderId: 101, method: 'WALLET' })
        .expect(404);

      expect(res.body.message).toContain('Không tìm thấy đơn hàng của bạn');
    });

    it('User A thanh toán đơn 101 của chính mình -> thành công 200/201 OK', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth-test/payments')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ orderId: 101, method: 'WALLET' })
        .expect(201);

      expect(res.body).toEqual({
        orderId: 101,
        status: 'PAID',
        paidByUserId: 1,
      });
    });
  });
});

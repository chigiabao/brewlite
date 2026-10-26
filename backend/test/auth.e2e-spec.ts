import { Controller, Get, INestApplication, UseGuards, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../src/auth/public.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

@Controller('auth-test')
@UseGuards(JwtAuthGuard)
class AuthTestController {
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}

describe('Identity (e2e)', () => {
  let app: INestApplication<App>;
  const users: Array<{ id: number; email: string; passwordHash: string }> = [];
  const prisma = {
    user: {
      create: vi.fn(async ({ data }: { data: { email: string; passwordHash: string } }) => {
        if (users.some((user) => user.email === data.email)) {
          throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        }
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
  });

  afterAll(async () => {
    await app.close();
  });

  let validToken: string;

  describe('Register (POST /auth/register)', () => {
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

    it('returns 201 Created and safe user info without exposing passwordHash', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'user@example.com', password: 'secret123' })
        .expect(201);

      expect(res.body).toEqual({ id: 1, email: 'user@example.com' });
      expect(users[0].passwordHash).not.toBe('secret123');
      expect((res.body as { passwordHash?: string }).passwordHash).toBeUndefined();
    });

    it('returns 409 Conflict when registering with an existing email (case-insensitive)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'USER@example.com', password: 'secret123' })
        .expect(409);

      expect(res.body.message).toContain('Email đã được đăng ký');
    });
  });

  describe('Login (POST /auth/login)', () => {
    it('returns 400 Bad Request when login payload violates DTO', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'invalid-email', password: '' })
        .expect(400);
    });

    it('returns 201/200 and a valid JWT accessToken for correct credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'secret123' })
        .expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.accessToken.split('.')).toHaveLength(3); // JWT structure: header.payload.signature
      validToken = res.body.accessToken;
    });

    it('returns 401 Unauthorized when password does not match', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'wrong-password' })
        .expect(401);

      expect(res.body.message).toContain('Email hoặc mật khẩu không đúng');
    });

    it('returns 401 Unauthorized when email does not exist', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'unknown@example.com', password: 'secret123' })
        .expect(401);

      expect(res.body.message).toContain('Email hoặc mật khẩu không đúng');
    });
  });

  describe('Protected API Access (JwtAuthGuard & @CurrentUser)', () => {
    it('returns 401 Unauthorized when Authorization header is missing', async () => {
      await request(app.getHttpServer()).get('/auth-test/me').expect(401);
    });

    it('returns 401 Unauthorized when Bearer token is invalid or malformed', async () => {
      await request(app.getHttpServer())
        .get('/auth-test/me')
        .set('Authorization', 'Bearer invalid-jwt-token')
        .expect(401);
    });

    it('returns 200 OK and injects AuthUser into @CurrentUser() when token is valid', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth-test/me')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(res.body).toEqual({ userId: 1, email: 'user@example.com' });
    });
  });
});

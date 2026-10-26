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

  it('covers register, duplicate email, login, invalid password, and JWT guard', async () => {
    // Kiểm tra validate DTO (400 Bad Request)
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'secret123' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'valid@example.com', password: '123' })
      .expect(400);

    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'user@example.com', password: 'secret123' })
      .expect(201);
    expect(registration.body).toEqual({ id: 1, email: 'user@example.com' });
    expect(users[0].passwordHash).not.toBe('secret123');

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'USER@example.com', password: 'secret123' })
      .expect(409);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'secret123' })
      .expect(201);
    expect(login.body.accessToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'wrong-password' })
      .expect(401);

    // Route guard: thiếu token -> 401
    await request(app.getHttpServer()).get('/auth-test/me').expect(401);

    // Route guard: token không hợp lệ -> 401
    await request(app.getHttpServer())
      .get('/auth-test/me')
      .set('Authorization', 'Bearer invalid-jwt-token')
      .expect(401);

    // Route guard: token hợp lệ -> 200
    await request(app.getHttpServer())
      .get('/auth-test/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200)
      .expect({ userId: 1, email: 'user@example.com' });
  }, 15000);
});

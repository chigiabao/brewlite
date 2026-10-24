import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const prisma = {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  };
  const jwtMock = { signAsync: vi.fn() };
  const service = new AuthService(prisma as never, jwtMock as unknown as JwtService);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hashes passwords and returns only safe registration fields', async () => {
    prisma.user.create.mockResolvedValue({ id: 7, email: 'user@example.com' });

    await expect(
      service.register({ email: ' User@Example.com ', password: 'secret123' }),
    ).resolves.toEqual({ id: 7, email: 'user@example.com' });

    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.email).toBe('user@example.com');
    expect(data.passwordHash).not.toBe('secret123');
    await expect(compare('secret123', data.passwordHash)).resolves.toBe(true);
  });

  it('maps a unique email violation to 409', async () => {
    prisma.user.create.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'P2002' }));

    await expect(
      service.register({ email: 'user@example.com', password: 'secret123' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns a JWT for valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 7,
      email: 'user@example.com',
      passwordHash: await hash('secret123', 4),
    });
    jwtMock.signAsync.mockResolvedValue('token');

    await expect(
      service.login({ email: 'USER@example.com', password: 'secret123' }),
    ).resolves.toEqual({ accessToken: 'token' });
    expect(jwtMock.signAsync).toHaveBeenCalledWith({ sub: 7, email: 'user@example.com' });
  });

  it('returns 401 for unknown or invalid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ email: 'user@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

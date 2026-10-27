import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthDto } from './auth.dto.js';

@Injectable()
export class AuthService {
  private static readonly PASSWORD_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: AuthDto): Promise<{ id: number; email: string }> {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await hash(dto.password, AuthService.PASSWORD_ROUNDS);

    try {
      return await this.prisma.user.create({
        data: { email, passwordHash },
        select: { id: true, email: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email đã được đăng ký');
      }
      throw error;
    }
  }

  async login(dto: AuthDto): Promise<{ accessToken: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, email: user.email }),
    };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

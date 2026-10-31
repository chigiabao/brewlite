import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthDto } from './auth.dto.js';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  /** D/G-03: email chuẩn hóa; không trả passwordHash; xử lý đua đăng ký. */
  async register(dto: AuthDto) {
    const email = dto.email.trim().toLowerCase();
    // bcrypt chỉ xử lý tối đa 72 BYTE, không phải 72 ký tự Unicode.
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException('Mật khẩu vượt giới hạn 72 byte của bcrypt');
    }
    try {
      return await this.prisma.user.create({
        data: { email, passwordHash: await hash(dto.password, 12) },
        select: { id: true, email: true },
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('Email đã tồn tại');
      }
      throw error;
    }
  }

  /** D/G-03: token chứa userId làm sub, sử dụng trong Orders/Payments/Rewards. */
  async login(dto: AuthDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    return { accessToken: await this.jwt.signAsync({ sub: user.id, email: user.email }) };
  }
}

import { Injectable, NotImplementedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthDto } from './auth.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // TODO(D – Task 7): băm mật khẩu bằng bcryptjs, lưu User, trả { id, email }.
  register(dto: AuthDto) {
    throw new NotImplementedException('POST /auth/register chưa làm (D – Task 7)');
  }

  // TODO(D – Task 7): so khớp mật khẩu, trả { accessToken } (payload: { sub: user.id, email }).
  login(dto: AuthDto) {
    throw new NotImplementedException('POST /auth/login chưa làm (D – Task 7)');
  }
}

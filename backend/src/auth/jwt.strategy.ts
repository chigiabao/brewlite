import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

/** D/G-03: chỉ nhận JWT hợp lệ từ Authorization: Bearer; không tin userId trên client. */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || (() => { throw new Error('Cần cấu hình JWT_SECRET'); })(),
    });
  }

  validate(payload: { sub?: number; email?: string }) {
    if (!Number.isSafeInteger(payload?.sub) || !payload.sub || payload.sub <= 0 ||
      typeof payload.email !== 'string') {
      throw new UnauthorizedException('JWT không hợp lệ');
    }
    return { userId: payload.sub, email: payload.email };
  }
}

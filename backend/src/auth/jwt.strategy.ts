import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from './current-user.decorator.js';

type JwtPayload = { sub: number; email: string };

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET ?? (process.env.NODE_ENV === 'test' ? 'brewlite-test-jwt-secret-minimum-32-chars' : undefined);
  if (!secret) {
    throw new Error('JWT_SECRET phải được cấu hình trước khi khởi động xác thực');
  }
  return secret;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (
      !payload ||
      !Number.isSafeInteger(payload.sub) ||
      payload.sub <= 0 ||
      typeof payload.email !== 'string' ||
      !payload.email.trim()
    ) {
      throw new UnauthorizedException();
    }
    return { userId: payload.sub, email: payload.email };
  }
}

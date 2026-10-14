import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthUser = { userId: number; email: string };

// Lấy user đã đăng nhập (do JwtStrategy gắn vào request).
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);

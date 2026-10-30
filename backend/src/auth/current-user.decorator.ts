import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export type AuthUser = { userId: number; email: string };

// Fail closed even if a future refactor accidentally removes a controller's JWT guard.
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => {
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (
      !user ||
      !Number.isSafeInteger(user.userId) ||
      user.userId <= 0 ||
      typeof user.email !== 'string' ||
      !user.email.trim()
    ) {
      throw new UnauthorizedException();
    }
    return user;
  },
);

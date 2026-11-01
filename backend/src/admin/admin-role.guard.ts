import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserRole } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/public.js';

/**
 * FIX 10 — Chỉ tài khoản có role ADMIN trong CSDL mới được gọi API /admin/*.
 * JwtAuthGuard phải chạy trước để xác thực chữ ký, hạn dùng và userId.
 * KHÔNG tin role trong JWT / request body / email người dùng gửi lên.
 * Đọc quyền từ DB ở mỗi request để thu hồi quyền có hiệu lực ngay.
 */
@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const principal = request.user;
    if (!principal || !Number.isSafeInteger(principal.userId) || principal.userId <= 0) {
      throw new UnauthorizedException('Cần đăng nhập để truy cập trang quản trị');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      select: { role: true },
    });
    if (!user || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Tài khoản không có quyền quản trị');
    }
    return true;
  }
}

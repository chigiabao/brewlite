/** FIX 10 — guard không tin role/email từ người gửi; luôn kiểm tra DB. */
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '../generated/prisma/enums.js';
import { AdminRoleGuard } from './admin-role.guard.js';

const db = { user: { findUnique: vi.fn() } };
const guard = new AdminRoleGuard(db as never);

function context(user: unknown): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}

describe('AdminRoleGuard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chặn request không có principal JWT', async () => {
    await expect(guard.canActivate(context(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('khách hàng không tự nâng quyền bằng cách giả mạo role', async () => {
    db.user.findUnique.mockResolvedValue({ role: UserRole.CUSTOMER });
    await expect(guard.canActivate(context({ userId: 4, email: 'admin@brewlite.vn', role: 'ADMIN' })))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: 4 }, select: { role: true } });
  });

  it('chỉ cho phép ADMIN đang tồn tại trong DB', async () => {
    db.user.findUnique.mockResolvedValue({ role: UserRole.ADMIN });
    await expect(guard.canActivate(context({ userId: 5, email: 'user@example.com' }))).resolves.toBe(true);
  });

  it('user bị xóa hoặc role thiếu thì từ chối (fail closed)', async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(context({ userId: 5, email: 'x@y.z' }))).rejects.toBeInstanceOf(ForbiddenException);
    db.user.findUnique.mockResolvedValue({});
    await expect(guard.canActivate(context({ userId: 5, email: 'x@y.z' }))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

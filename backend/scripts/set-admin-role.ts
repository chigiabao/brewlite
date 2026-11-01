/**
 * FIX 10: cấp/thu hồi quyền Admin thủ công bằng quyền truy cập DB của người vận hành.
 * Không có HTTP endpoint cấp quyền (tránh tự nâng quyền qua API).
 * Ví dụ: ADMIN_EMAIL=admin@gmail.com ADMIN_ACTION=grant ADMIN_NEW_PASSWORD=... npx tsx scripts/set-admin-role.ts
 * Chỉ chạy sau khi đã xác minh chủ sở hữu tài khoản. Không dùng email chưa kiểm soát.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { UserRole } from '../src/generated/prisma/enums.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const action = process.env.ADMIN_ACTION;
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['grant', 'revoke'].includes(action ?? '')) {
  throw new Error('Cần ADMIN_EMAIL hợp lệ và ADMIN_ACTION=grant hoặc revoke');
}
if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL');
// Để không bật quyền Admin cho tài khoản demo dùng mật khẩu công khai,
// khi cấp quyền luôn buộc đặt lại mật khẩu mạnh trên cùng transaction cập nhật user.
const newPassword = process.env.ADMIN_NEW_PASSWORD;
if (action === 'grant' && (!newPassword || Buffer.byteLength(newPassword, 'utf8') < 12 || Buffer.byteLength(newPassword, 'utf8') > 72)) {
  throw new Error('ADMIN_NEW_PASSWORD phải dài 12–72 byte khi cấp quyền ADMIN');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!existing) throw new Error('Tài khoản chưa tồn tại. Hãy đăng ký qua /auth/register trước.');
  await prisma.user.update({
    where: { id: existing.id },
    data: action === 'grant'
      ? { role: UserRole.ADMIN, passwordHash: await hash(newPassword!, 12) }
      : { role: UserRole.CUSTOMER },
  });
  console.log(`Đã ${action === 'grant' ? 'cấp' : 'thu hồi'} quyền ADMIN cho ${email}`);
} finally {
  await prisma.$disconnect();
}

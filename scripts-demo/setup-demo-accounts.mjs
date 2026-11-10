// Script khởi tạo / nâng cấp 2 tài khoản demo:
// 1. Customer: customer@gmail.com / password123 (50,000 điểm tha hồ test voucher & points)
// 2. Admin: admin@brewlite.local / admin123 (Role ADMIN, có toàn quyền vào /admin)
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../backend/src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL || 'postgresql://brew:brew@127.0.0.1:5432/brewlite?schema=public';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🚀 Đang thiết lập tài khoản Demo song song (Customer + Admin)...\n');

  // 1. Tài khoản CUSTOMER
  const customerEmail = 'customer@gmail.com';
  const customerPass = 'password123';
  const customerHash = await bcrypt.hash(customerPass, 12);

  const customer = await prisma.user.upsert({
    where: { email: customerEmail },
    update: {
      passwordHash: customerHash,
      role: 'CUSTOMER',
      loyaltyPoints: 50000, // Tặng 50k điểm để demo trừ điểm
    },
    create: {
      email: customerEmail,
      passwordHash: customerHash,
      role: 'CUSTOMER',
      loyaltyPoints: 50000,
    },
  });
  console.log('✅ [1/2] CUSTOMER đã sẵn sàng:');
  console.log(`   - Email: ${customer.email}`);
  console.log(`   - Mật khẩu: ${customerPass}`);
  console.log(`   - Role: ${customer.role}`);
  console.log(`   - Điểm Loyalty: ${customer.loyaltyPoints} điểm\n`);

  // 2. Tài khoản ADMIN
  const adminEmail = 'admin@brewlite.local';
  const adminPass = 'admin123';
  const adminHash = await bcrypt.hash(adminPass, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: adminHash,
      role: 'ADMIN',
    },
    create: {
      email: adminEmail,
      passwordHash: adminHash,
      role: 'ADMIN',
      loyaltyPoints: 0,
    },
  });
  console.log('👑 [2/2] ADMIN (Barista) đã sẵn sàng:');
  console.log(`   - Email: ${admin.email}`);
  console.log(`   - Mật khẩu: ${adminPass}`);
  console.log(`   - Role: ${admin.role} (Toàn quyền quản trị đơn & menu)\n`);

  console.log('🎉 Xong! Bạn có thể dùng 2 tài khoản này để demo 2 màn hình song song.');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi thiết lập tài khoản:', e.message);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


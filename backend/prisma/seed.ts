// Dữ liệu mẫu cho menu. Người phụ trách: B (Task 2).
// Chạy: npx prisma db seed
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  if ((await prisma.product.count()) > 0) return;
  await prisma.product.createMany({
    data: [
      { name: 'Cà phê sữa', price: 35000, imageUrl: '/img/caphesua.jpg' },
      { name: 'Americano', price: 40000, imageUrl: '/img/americano.jpg' },
      { name: 'Cappuccino', price: 45000, imageUrl: '/img/cappuccino.jpg' },
      { name: 'Trà đào', price: 39000, imageUrl: '/img/tradao.jpg' },
    ],
  });
  // TODO(B): thêm sản phẩm nếu cần. TODO(G): thêm Coupon mẫu cho Task 10.
}

main().finally(() => prisma.$disconnect());

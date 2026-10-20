import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const count = await prisma.product.count();
  if (count === 0) {
    await prisma.product.createMany({
      data: [
        { name: 'Cà phê sữa', price: 35000, imageUrl: '/img/caphesua.jpg', stock: 20 },
        { name: 'Americano', price: 40000, imageUrl: '/img/americano.jpg', stock: 20 },
        { name: 'Cappuccino', price: 45000, imageUrl: '/img/cappuccino.jpg', stock: 20 },
        { name: 'Trà đào', price: 39000, imageUrl: '/img/tradao.jpg', stock: 20 },
        { name: 'Latte', price: 45000, imageUrl: '/img/latte.jpg', stock: 20 },
        { name: 'Matcha Latte', price: 49000, imageUrl: '/img/matchalatte.jpg', stock: 20 },
      ],
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

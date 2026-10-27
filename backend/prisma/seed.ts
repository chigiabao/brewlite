// Dữ liệu mẫu idempotent cho Product (B) và Coupon (G), điều phối bởi A (Sprint 2).
// Chạy nhiều lần không tạo bản ghi trùng và không bỏ qua Coupon khi DB đã có Product:
//   npx prisma db seed
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SEED_PRODUCTS = [
  { name: 'Cà phê sữa', price: 35000, imageUrl: '/img/caphesua.jpg', stock: 100 },
  { name: 'Americano', price: 40000, imageUrl: '/img/americano.jpg', stock: 100 },
  { name: 'Cappuccino', price: 45000, imageUrl: '/img/cappuccino.jpg', stock: 100 },
  { name: 'Trà đào', price: 39000, imageUrl: '/img/tradao.jpg', stock: 100 },
  { name: 'Latte', price: 45000, imageUrl: '/img/latte.jpg', stock: 100 },
  { name: 'Matcha Latte', price: 49000, imageUrl: '/img/matchalatte.jpg', stock: 100 },
] as const;

const SEED_COUPONS = [
  {
    code: 'GIAM10',
    discountPercent: 10,
    discountAmount: null,
    minOrderValue: 30000,
    maxUses: 100,
    expiresAt: new Date('2027-12-31T23:59:59.000Z'),
    active: true,
  },
  {
    code: 'GIAM15K',
    discountPercent: null,
    discountAmount: 15000,
    minOrderValue: 50000,
    maxUses: 50,
    expiresAt: new Date('2027-12-31T23:59:59.000Z'),
    active: true,
  },
  {
    code: 'HET_HAN',
    discountPercent: 20,
    discountAmount: null,
    minOrderValue: 0,
    maxUses: 10,
    expiresAt: new Date('2025-01-01T00:00:00.000Z'),
    active: true,
  },
] as const;

async function seedProducts(): Promise<void> {
  for (const item of SEED_PRODUCTS) {
    const existing = await prisma.product.findFirst({
      where: { name: item.name },
      select: { id: true },
    });
    if (!existing) {
      await prisma.product.create({ data: item });
    } else {
      await prisma.product.update({
        where: { id: existing.id },
        data: { price: item.price, imageUrl: item.imageUrl },
      });
    }
  }
}

async function seedCoupons(): Promise<void> {
  for (const coupon of SEED_COUPONS) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: {
        discountPercent: coupon.discountPercent,
        discountAmount: coupon.discountAmount,
        minOrderValue: coupon.minOrderValue,
        maxUses: coupon.maxUses,
        expiresAt: coupon.expiresAt,
        active: coupon.active,
      },
      create: coupon,
    });
  }
}

async function main(): Promise<void> {
  await seedProducts();
  await seedCoupons();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

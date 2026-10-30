/**
 * FIX05 — Verifies that rerunning Prisma seed does not mutate existing demo data.
 * Run from backend after npm ci, with DATABASE_URL set.
 *   node scripts/seed-fingerprint.mjs --write /tmp/seed-before.json
 *   npx prisma db seed
 *   node scripts/seed-fingerprint.mjs --compare /tmp/seed-before.json --write /tmp/seed-after.json
 * Does NOT log credentials, email addresses, JWTs or password hashes.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return process.argv[index + 1];
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const writeTo = getArg('--write');
  const compareTo = getArg('--compare');
  await client.connect();
  const [products, coupons, users] = await Promise.all([
    client.query('SELECT id, name, price, "imageUrl", stock, version FROM "Product" ORDER BY id'),
    client.query('SELECT code, "discountPercent", "discountAmount", "minOrderValue", "maxUses", "usedCount", "expiresAt", active FROM "Coupon" ORDER BY code'),
    client.query('SELECT id, email, "loyaltyPoints" FROM "User" ORDER BY id'),
  ]);
  const records = { products: products.rows, coupons: coupons.rows, users: users.rows };
  const counts = Object.fromEntries(Object.entries(records).map(([key, value]) => [key, value.length]));
  if (Object.values(counts).some((count) => count === 0)) {
    throw new Error(`Seed incomplete: ${JSON.stringify(counts)}`);
  }
  if (!coupons.rows.some((coupon) => coupon.code === 'GIAM10')) {
    throw new Error('Seed incomplete: GIAM10 coupon is missing');
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(records)).digest('hex');
  const snapshot = { version: 1, counts, sha256: fingerprint };
  if (compareTo) {
    const previous = JSON.parse(await readFile(resolve(compareTo), 'utf8'));
    if (previous.sha256 !== snapshot.sha256 || JSON.stringify(previous.counts) !== JSON.stringify(snapshot.counts)) {
      throw new Error(`SEED_NOT_IDEMPOTENT: before=${previous.sha256} after=${snapshot.sha256}`);
    }
    console.log('PASS: seed twice is idempotent');
  }
  if (writeTo) {
    const target = resolve(writeTo);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  }
  console.log(JSON.stringify(snapshot));
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

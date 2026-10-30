import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

/** Every run owns a fresh schema. Never reset, seed or delete from public. */
export async function createRewardsTestDatabase() {
  const connectionString = process.env.REWARDS_TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Set REWARDS_TEST_DATABASE_URL to run PostgreSQL rewards regression');
  }

  const schema = `rewards_g04_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString, connectionTimeoutMillis: 5_000, max: 1 });
  const connection = await admin.connect().catch(async (error: unknown) => {
    await admin.end();
    throw error;
  });
  try {
    await connection.query('BEGIN');
    await connection.query(`CREATE SCHEMA "${schema}"`);
    await connection.query(`SET LOCAL search_path TO "${schema}"`);
    const migrations = new URL('../../prisma/migrations/', import.meta.url);
    const entries = await readdir(migrations, { withFileTypes: true });
    for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      await connection.query(await readFile(new URL(`${entry.name}/migration.sql`, migrations), 'utf8'));
    }
    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK');
    connection.release();
    await admin.end();
    throw error;
  }
  connection.release();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 5_000,
      options: `-c search_path=${schema}`,
      max: 15,
    }, { schema }),
    transactionOptions: { maxWait: 10_000, timeout: 15_000 },
  });

  return {
    prisma,
    async close() {
      // Only this generated identifier can reach DROP SCHEMA.
      if (!/^rewards_g04_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid test schema');
      try {
        try {
          await prisma.$disconnect();
        } finally {
          await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        }
      } finally {
        await admin.end();
      }
    },
  };
}

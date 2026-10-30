import { defineConfig } from 'vitest/config';

// This command must fail clearly rather than report a skipped PostgreSQL suite.
if (!process.env.REWARDS_TEST_DATABASE_URL) {
  throw new Error('REWARDS_TEST_DATABASE_URL is required for test:rewards:regression');
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    fileParallelism: false,
    include: [
      'src/rewards/*.spec.ts',
      'src/payments/payments.service.spec.ts',
      'test/rewards.regression.e2e-spec.ts',
    ],
    hookTimeout: 30_000,
    testTimeout: 20_000,
  },
});

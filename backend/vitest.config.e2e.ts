// import { defineConfig } from 'vitest/config';

// export default defineConfig({
//   resolve: { tsconfigPaths: true },
//   test: {
//     globals: true,
//     root: './',
//     include: ['**/*.e2e-spec.ts'],
//     fileParallelism: false,
//   },
// });

import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

dotenv.config({ path: './.env' });
dotenv.config({ path: '../.env', override: false });

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    fileParallelism: false,
  },
});

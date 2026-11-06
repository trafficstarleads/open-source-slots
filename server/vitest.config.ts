import { defineConfig } from 'vitest/config';

const STAND_DATABASE_URL = 'postgres://postgres:test@localhost:5434/postgres';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    env: {
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? STAND_DATABASE_URL,
    },
    coverage: {
      include: ['src/**/*.ts', 'dev/**/*.ts', 'scripts/**/*.ts'],
    },
  },
});

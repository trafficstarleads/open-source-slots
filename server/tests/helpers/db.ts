import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { applyMigrations } from '../../src/db/migrate';

export interface TestDatabase {
  readonly url: string;
  readonly pool: Pool;
  readonly close: () => Promise<void>;
}

export function standDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error('TEST_DATABASE_URL is not set');
  }
  return url;
}

function urlWithSearchPath(standUrl: string, schema: string): string {
  const url = new URL(standUrl);
  url.searchParams.set('options', `-c search_path=${schema}`);
  return url.toString();
}

export async function createTestDatabase(migrated = true): Promise<TestDatabase> {
  const schema = `t_${randomBytes(6).toString('hex')}`;
  const admin = new Pool({ connectionString: standDatabaseUrl() });
  await admin.query(`create schema ${schema}`);
  const url = urlWithSearchPath(standDatabaseUrl(), schema);
  if (migrated) {
    await applyMigrations(url);
  }
  const pool = new Pool({ connectionString: url });
  return {
    url,
    pool,
    close: async () => {
      await pool.end();
      await admin.query(`drop schema ${schema} cascade`);
      await admin.end();
    },
  };
}

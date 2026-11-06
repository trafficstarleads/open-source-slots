import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import { Client } from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));
const MIGRATIONS_TABLE = 'pgmigrations';

async function currentSchema(databaseUrl: string): Promise<string> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ schema: string }>('select current_schema() as schema');
    return rows[0].schema;
  } finally {
    await client.end();
  }
}

export async function applyMigrations(databaseUrl: string): Promise<void> {
  await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    migrationsTable: MIGRATIONS_TABLE,
    schema: await currentSchema(databaseUrl),
    direction: 'up',
    log: () => undefined,
  });
}

import { Pool } from 'pg';

export type Database = Pick<Pool, 'query'>;

export interface PoolLogger {
  readonly error: (fields: object, message: string) => void;
}

export function createPool(databaseUrl: string, logger: PoolLogger): Pool {
  const pool = new Pool({ connectionString: databaseUrl });
  pool.on('error', (error) => logger.error({ err: error }, 'database_connection_failed'));
  return pool;
}

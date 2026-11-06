import { Pool, types, type CustomTypesConfig } from 'pg';

export type Database = Pick<Pool, 'query'>;

export interface PoolLogger {
  readonly error: (fields: object, message: string) => void;
}

export const CENTS_AS_NUMBERS: CustomTypesConfig = {
  getTypeParser: (oid, format) => (oid === types.builtins.INT8 ? Number : types.getTypeParser(oid, format)),
};

export function createPool(databaseUrl: string, logger: PoolLogger): Pool {
  const pool = new Pool({ connectionString: databaseUrl, types: CENTS_AS_NUMBERS });
  pool.on('error', (error) => logger.error({ err: error }, 'database_connection_failed'));
  return pool;
}

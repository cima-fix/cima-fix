import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import * as schema from './schema.ts'

// Neon and PGlite databases are both PgDatabase; the query-result type differs, hence `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = PgDatabase<any, typeof schema>
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
/** Repositories accept either, so they work inside or outside a transaction. */
export type Executor = Database | Tx

let current: Database | undefined

/** Neon (pooled, WebSocket) in production (DD-03). Tests inject PGlite with `setDb`. */
export function getDb(): Database {
  if (!current) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    current = drizzle({ client: new Pool({ connectionString: url }), schema })
  }
  return current
}

/** Tests only. */
export function setDb(db: Database): void {
  current = db
}

/** Tests only. */
export function resetDb(): void {
  current = undefined
}

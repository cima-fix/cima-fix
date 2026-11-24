import { PGlite } from '@electric-sql/pglite'
import { getTableName, is, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { PgTable } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { resetDb, setDb, type Database } from '../../src/server/db/client.ts'
import * as schema from '../../src/server/db/schema.ts'

/**
 * In-process PostgreSQL with the REAL migrations from ./drizzle applied,
 * so the tests also verify the generated SQL. Run `npm run db:generate` first.
 */
export function useTestDb() {
  let client: PGlite | undefined
  const ctx = {} as { db: Database }

  beforeAll(async () => {
    client = new PGlite()
    const db = drizzle({ client, schema })
    await migrate(db, { migrationsFolder: './drizzle' })
    ctx.db = db
    setDb(db)
  })

  beforeEach(async () => {
    const names = Object.values(schema as Record<string, unknown>)
      .filter((v): v is PgTable => is(v, PgTable))
      .map((t) => `"${getTableName(t)}"`)
      .join(', ')
    await ctx.db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`))
  })

  afterAll(async () => {
    resetDb()
    await client?.close()
  })

  return ctx
}

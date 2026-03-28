/**
 * Drizzle ORM Client for Darts App
 * Connects to Neon Postgres via the serverless HTTP driver.
 * Used server-side in Vercel API routes (api/db.js → api/db.ts).
 */
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './drizzle-schema'

/**
 * Create a Drizzle DB instance.
 * Call this in the API route handler with the DATABASE_URL from env.
 */
export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl)
  return drizzle(sql, { schema })
}

export type DrizzleDb = ReturnType<typeof createDb>

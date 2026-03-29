/**
 * Profile Repository
 * CRUD for player profiles, sessions, system metadata.
 */
import { eq, sql } from 'drizzle-orm'
import type { DrizzleDb } from '../drizzle'
import * as schema from '../drizzle-schema'

export function createProfileRepository(db: DrizzleDb) {
  return {
    async getAll() {
      return db.select().from(schema.profiles).orderBy(schema.profiles.name)
    },

    async getById(id: string) {
      const [profile] = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, id))
        .limit(1)
      return profile ?? null
    },

    async save(data: typeof schema.profiles.$inferInsert) {
      await db
        .insert(schema.profiles)
        .values(data)
        .onConflictDoUpdate({
          target: schema.profiles.id,
          set: data,
        })
    },

    async delete(id: string) {
      await db.delete(schema.profiles).where(eq(schema.profiles.id, id))
    },

    async updateColor(id: string, color: string) {
      await db
        .update(schema.profiles)
        .set({ color, updatedAt: new Date().toISOString() })
        .where(eq(schema.profiles.id, id))
    },

    async rename(id: string, name: string) {
      await db
        .update(schema.profiles)
        .set({ name, updatedAt: new Date().toISOString() })
        .where(eq(schema.profiles.id, id))
    },
  }
}

export function createSystemMetaRepository(db: DrizzleDb) {
  return {
    async get(key: string): Promise<string | null> {
      const [row] = await db
        .select()
        .from(schema.systemMeta)
        .where(eq(schema.systemMeta.key, key))
        .limit(1)
      return row?.value ?? null
    },

    async set(key: string, value: string) {
      await db
        .insert(schema.systemMeta)
        .values({ key, value, updatedAt: new Date().toISOString() })
        .onConflictDoUpdate({
          target: schema.systemMeta.key,
          set: { value, updatedAt: new Date().toISOString() },
        })
    },
  }
}

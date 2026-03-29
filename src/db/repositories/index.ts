/**
 * Repository barrel export + factory.
 * Creates all repositories from a single DrizzleDb instance.
 */
export { createGameRepository, createAllGameRepositories, GAME_TABLES } from './game-repository'
export type { GameMode, GameTableSet, MatchRow, MatchPlayerRow, EventRow, MatchWithRelations } from './game-repository'

export { createProfileRepository, createSystemMetaRepository } from './profile-repository'

import type { DrizzleDb } from '../drizzle'
import { createAllGameRepositories } from './game-repository'
import { createProfileRepository, createSystemMetaRepository } from './profile-repository'

export function createRepositories(db: DrizzleDb) {
  return {
    games: createAllGameRepositories(db),
    profiles: createProfileRepository(db),
    system: createSystemMetaRepository(db),
  }
}

export type Repositories = ReturnType<typeof createRepositories>

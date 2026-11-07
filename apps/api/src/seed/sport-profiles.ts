import type { EntityManager } from '@mikro-orm/postgresql';
import { SportProfile } from '../entities/sport-profile.entity';

type Seed = Pick<SportProfile, 'code' | 'positions' | 'starterBench' | 'maxStarters' | 'modulesAvailable'>;

const MODULES = ['attendances', 'standings', 'sanctions'];

/**
 * Initial sport profiles. The data schema is identical for all: a profile only changes the optional features.
 * Only codes here: texts (sport name, positions, terminology) live in the frontend, translated per language.
 * Starter or bench is active only for football. Volleyball and basketball need a different lineup model (phase 2).
 */
export const SPORT_PROFILES: Seed[] = [
  {
    code: 'generic',
    positions: [],
    starterBench: false,
    maxStarters: null,
    modulesAvailable: MODULES,
  },
  {
    code: 'football',
    positions: ['goalkeeper', 'defender', 'midfielder', 'forward'],
    starterBench: true,
    maxStarters: 11,
    modulesAvailable: MODULES,
  },
  {
    code: 'five_a_side_football',
    positions: ['goalkeeper', 'defender', 'winger', 'pivot'],
    starterBench: true,
    maxStarters: 5,
    modulesAvailable: MODULES,
  },
  {
    code: 'volleyball',
    positions: ['setter', 'opposite', 'hitter', 'central', 'libero'],
    starterBench: false,
    maxStarters: null,
    modulesAvailable: MODULES,
  },
  {
    code: 'basket',
    positions: ['playmaker', 'guard', 'small_forward', 'power_forward', 'center'],
    starterBench: false,
    maxStarters: null,
    modulesAvailable: MODULES,
  },
  {
    code: 'fencing',
    positions: [],
    starterBench: false,
    maxStarters: null,
    modulesAvailable: ['attendances', 'standings'],
  },
];

/** Idempotente: crea i profili mancanti e riallinea quelli esistenti per codice. Sicuro da rilanciare a ogni deploy. */
export async function seedSportProfiles(em: EntityManager): Promise<void> {
  // upsertMany does not apply the entity defaults: dates must be passed. createdAt is never rewritten.
  const time = new Date();
  await em.upsertMany(
    SportProfile,
    SPORT_PROFILES.map((p) => ({ ...p, createdAt: time, updatedAt: time })),
    { onConflictFields: ['code'], onConflictExcludeFields: ['createdAt'] },
  );
}

import { isDemo, assertLiveEnv } from '../config';
import { createMemoryDb } from './memory';
import { createSupabaseDb } from './supabase';
import { ensureDemoSeed } from '../demo-data';
import type { Db } from './types';

export * from './types';

let db: Db | null = null;
let seeded: Promise<void> | null = null;

/** Returns the app database. In demo mode the in-memory store is seeded once per server process. */
export async function getDb(): Promise<Db> {
  if (!db) {
    assertLiveEnv();
    db = isDemo ? createMemoryDb() : createSupabaseDb();
  }
  if (isDemo) seeded ??= ensureDemoSeed(db);
  await seeded;
  return db;
}

/** Test helper: swap in a fresh database. */
export function __setDbForTests(d: Db | null) { db = d; seeded = d ? Promise.resolve() : null; }

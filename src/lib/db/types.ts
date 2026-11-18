export type Row = Record<string, any>;
export type Where = Record<string, unknown>;
export interface SelectOpts { order?: [string, 'asc' | 'desc']; limit?: number; in?: Record<string, unknown[]> }

export class DuplicateError extends Error { constructor(msg = 'duplicate key') { super(msg); this.name = 'DuplicateError'; } }

/** The only persistence surface the app uses. Implemented for memory (demo) and Supabase (live). */
export interface Db {
  select<T = Row>(table: string, where?: Where, opts?: SelectOpts): Promise<T[]>;
  get<T = Row>(table: string, where: Where): Promise<T | null>;
  insert<T = Row>(table: string, row: Row): Promise<T>; // throws DuplicateError on unique violation
  update<T = Row>(table: string, where: Where, patch: Row): Promise<T[]>;
  delete(table: string, where: Where): Promise<void>;
}

/** Tables with a natural primary key other than "id". */
export const PK: Record<string, string> = { platform_settings: 'id', stripe_events: 'id' };
export const UNIQUE: Record<string, string[]> = {
  orders: ['idempotency_key', 'reference'],
  restaurants: ['slug'],
  profiles: ['email'],
  promotions: ['code'],
  memberships: ['user_id'],
  stripe_events: ['id'],
  restaurant_staff: ['restaurant_id|user_id'],
};

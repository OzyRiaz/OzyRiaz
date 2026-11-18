import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DuplicateError, type Db } from './types';

let client: SupabaseClient | null = null;
/** Service-role client. SERVER ONLY — bypasses RLS. All callers must authorise first (see lib/auth). */
export const adminClient = (): SupabaseClient => {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
};

const fail = (error: { code?: string; message: string }) => {
  if (error.code === '23505') throw new DuplicateError(error.message);
  throw new Error(`Supabase: ${error.message}`);
};

export function createSupabaseDb(): Db {
  const filt = (q: any, where: Record<string, unknown> = {}, ins?: Record<string, unknown[]>) => {
    for (const [k, v] of Object.entries(where)) q = v === null ? q.is(k, null) : q.eq(k, v);
    for (const [k, v] of Object.entries(ins ?? {})) q = q.in(k, v);
    return q;
  };
  return {
    async select(table, where, opts) {
      let q = filt(adminClient().from(table).select('*'), where, opts?.in);
      if (opts?.order) q = q.order(opts.order[0], { ascending: opts.order[1] === 'asc' });
      if (opts?.limit) q = q.limit(opts.limit);
      const { data, error } = await q;
      if (error) fail(error);
      return (data ?? []) as any;
    },
    async get(table, where) {
      const { data, error } = await filt(adminClient().from(table).select('*'), where).limit(1).maybeSingle();
      if (error) fail(error);
      return (data ?? null) as any;
    },
    async insert(table, row) {
      const { data, error } = await adminClient().from(table).insert(row).select('*').single();
      if (error) fail(error);
      return data as any;
    },
    async update(table, where, patch) {
      const { data, error } = await filt(adminClient().from(table).update(patch), where).select('*');
      if (error) fail(error);
      return (data ?? []) as any;
    },
    async delete(table, where) {
      const { error } = await filt(adminClient().from(table).delete(), where);
      if (error) fail(error);
    },
  };
}

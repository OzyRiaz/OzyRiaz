import { randomUUID } from 'node:crypto';
import { DuplicateError, UNIQUE, type Db, type Row, type SelectOpts, type Where } from './types';

type Store = Map<string, Row[]>;
const g = globalThis as unknown as { __bdfStore?: Store };
export const memStore = (): Store => (g.__bdfStore ??= new Map());

const match = (r: Row, where: Where = {}, opts?: SelectOpts) => {
  for (const [k, v] of Object.entries(where)) if (r[k] !== v) return false;
  if (opts?.in) for (const [k, vals] of Object.entries(opts.in)) if (!vals.includes(r[k])) return false;
  return true;
};
const clone = <T,>(x: T): T => structuredClone(x);

export function createMemoryDb(): Db {
  const rows = (t: string) => {
    const s = memStore();
    if (!s.has(t)) s.set(t, []);
    return s.get(t)!;
  };
  return {
    async select(table, where, opts) {
      let out = rows(table).filter((r) => match(r, where, opts)).map(clone);
      if (opts?.order) {
        const [col, dir] = opts.order;
        out.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
      }
      if (opts?.limit) out = out.slice(0, opts.limit);
      return out as any;
    },
    async get(table, where) {
      const r = rows(table).find((x) => match(x, where));
      return (r ? clone(r) : null) as any;
    },
    async insert(table, row) {
      const t = rows(table);
      const rec: Row = { id: randomUUID(), created_at: new Date().toISOString(), ...clone(row) };
      for (const key of UNIQUE[table] ?? []) {
        const cols = key.split('|');
        if (cols.some((c) => rec[c] === undefined || rec[c] === null)) continue;
        if (t.some((x) => cols.every((c) => x[c] === rec[c]))) throw new DuplicateError(`${table}.${key}`);
      }
      t.push(rec);
      return clone(rec) as any;
    },
    async update(table, where, patch) {
      const hit = rows(table).filter((r) => match(r, where));
      hit.forEach((r) => Object.assign(r, clone(patch)));
      return hit.map(clone) as any;
    },
    async delete(table, where) {
      const t = rows(table);
      const keep = t.filter((r) => !match(r, where));
      t.length = 0; t.push(...keep);
    },
  };
}

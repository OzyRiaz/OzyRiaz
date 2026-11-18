'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface BasketLine { key: string; itemId: string; name: string; qty: number; optionChoiceIds: string[]; optionLabels: string[]; unitPence: number; note?: string }
export interface Basket { id: string; restaurantId: string; restaurantSlug: string; restaurantName: string; lines: BasketLine[] }

export interface Prefs { fulfilment: 'delivery' | 'collection'; postcode: string; promo: string }
interface Ctx {
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  basket: Basket | null;
  count: number;
  add: (r: { id: string; slug: string; name: string }, line: Omit<BasketLine, 'key'>, replace?: boolean) => 'ok' | 'other-restaurant';
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  hydrated: boolean;
}
const C = createContext<Ctx | null>(null);
// Storage keys keep their original (pre-rebrand) names on purpose: renaming would silently empty customers' saved baskets.
const KEY = 'bdfeast.basket.v1';
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

export function BasketProvider({ children }: { children: ReactNode }) {
  const [basket, setBasket] = useState<Basket | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>({ fulfilment: 'delivery', postcode: '', promo: '' });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY); if (raw) setBasket(JSON.parse(raw));
      const p = localStorage.getItem(KEY + '.prefs'); const pc = localStorage.getItem('bdfeast.postcode');
      setPrefsState((cur) => { const saved = p ? JSON.parse(p) : {}; return { ...cur, ...saved, postcode: saved.postcode || pc || '' }; });
    } catch { /* storage blocked */ }
    setHydrated(true);
  }, []);
  const setPrefs = useCallback((p: Partial<Prefs>) => setPrefsState((cur) => {
    const next = { ...cur, ...p };
    try { localStorage.setItem(KEY + '.prefs', JSON.stringify(next)); if (p.postcode) localStorage.setItem('bdfeast.postcode', p.postcode); } catch { /* ignore */ }
    return next;
  }), []);
  useEffect(() => {
    if (!hydrated) return;
    try { basket ? localStorage.setItem(KEY, JSON.stringify(basket)) : localStorage.removeItem(KEY); } catch { /* ignore */ }
  }, [basket, hydrated]);

  const add = useCallback<Ctx['add']>((r, line, replace) => {
    let result: 'ok' | 'other-restaurant' = 'ok';
    setBasket((cur) => {
      if (cur && cur.restaurantId !== r.id && !replace) { result = 'other-restaurant'; return cur; }
      const base: Basket = !cur || cur.restaurantId !== r.id ? { id: uid(), restaurantId: r.id, restaurantSlug: r.slug, restaurantName: r.name, lines: [] } : cur;
      const sig = JSON.stringify([line.itemId, [...line.optionChoiceIds].sort(), line.note ?? '']);
      const hit = base.lines.find((l) => JSON.stringify([l.itemId, [...l.optionChoiceIds].sort(), l.note ?? '']) === sig);
      const lines = hit ? base.lines.map((l) => (l === hit ? { ...l, qty: Math.min(l.qty + line.qty, 50) } : l)) : [...base.lines, { ...line, key: uid() }];
      return { ...base, lines };
    });
    return result;
  }, []);
  const setQty = useCallback((key: string, qty: number) => setBasket((b) => {
    if (!b) return b;
    const lines = qty <= 0 ? b.lines.filter((l) => l.key !== key) : b.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(qty, 50) } : l));
    return lines.length ? { ...b, lines } : null;
  }), []);
  const remove = useCallback((key: string) => setQty(key, 0), [setQty]);
  const clear = useCallback(() => setBasket(null), []);
  const count = useMemo(() => basket?.lines.reduce((s, l) => s + l.qty, 0) ?? 0, [basket]);
  return <C.Provider value={{ prefs, setPrefs, basket, count, add, setQty, remove, clear, hydrated }}>{children}</C.Provider>;
}

export const useBasket = () => { const c = useContext(C); if (!c) throw new Error('BasketProvider missing'); return c; };

/** Stable key: same basket contents => same key (blocks duplicate orders); edited basket => new key. */
export function orderKey(b: Basket, extra: unknown): string {
  const s = JSON.stringify([b.lines.map((l) => [l.itemId, l.qty, [...l.optionChoiceIds].sort(), l.note ?? '']), extra]);
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${b.id}:${(h >>> 0).toString(36)}`;
}

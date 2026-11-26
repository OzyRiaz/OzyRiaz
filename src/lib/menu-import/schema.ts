import { z } from 'zod';
import { ALLERGENS, DIETARY } from '../allergens';

export type Allergen = (typeof ALLERGENS)[number];
export type Dietary = (typeof DIETARY)[number];

/** One dish found in a menu. Everything here is a SUGGESTION until the restaurant owner reviews and saves it. */
export interface ImportedItem {
  name: string;
  description: string;
  price_pence: number | null; // null = could not read a price (the owner must enter one)
  category: string;
  dietary: Dietary[];   // suggestions only; never saved unless the owner ticks them
  allergens: Allergen[]; // suggestions only; never saved unless the owner ticks them
  flags: string[];       // things the owner should double-check
}
export interface ImportedMenu {
  items: ImportedItem[];
  warnings: string[];
  source: 'text' | 'image' | 'pdf';
  provider: 'parser' | 'claude';
}

export const LIMITS = { maxItems: 200, name: 80, description: 300, category: 40, maxPricePence: 50_000, highPricePence: 10_000, maxTextChars: 40_000 } as const;

/** What the owner finally saves. Validated again on the server: the browser is never trusted. */
export const CommitItemSchema = z.object({
  name: z.string().trim().min(2, 'Every item needs a name').max(LIMITS.name),
  description: z.string().trim().max(LIMITS.description),
  price_pence: z.number().int().min(1, 'Every item needs a price').max(LIMITS.maxPricePence),
  category: z.string().trim().min(1, 'Every item needs a category').max(LIMITS.category),
  dietary: z.array(z.enum(DIETARY)).max(DIETARY.length),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length),
});
export const CommitSchema = z.object({ items: z.array(CommitItemSchema).min(1, 'Nothing to save').max(LIMITS.maxItems), publish: z.boolean(), checked: z.literal(true, { error: 'Please tick the box to confirm you have checked every name and price' }) });
export type CommitInput = z.infer<typeof CommitSchema>;

const clean = (s: string) => s.replace(/[\u0000-\u001f​-‍﻿]/g, ' ').replace(/\s+/g, ' ').trim();
const key = (cat: string, name: string) => `${cat.toLowerCase()}|${name.toLowerCase()}`;

/**
 * Makes parser and AI output safe and tidy, and flags what the owner must look at. Pure function.
 * Never invents anything: it only trims, clamps, de-duplicates and annotates.
 */
export function normalizeMenu(items: ImportedItem[], source: ImportedMenu['source'], provider: ImportedMenu['provider'], warnings: string[] = []): ImportedMenu {
  const out: ImportedItem[] = []; const seen = new Set<string>(); let dupes = 0, truncated = false;
  for (const raw of items) {
    if (out.length >= LIMITS.maxItems) { truncated = true; break; }
    const name = clean(raw.name).slice(0, LIMITS.name);
    if (name.length < 2) continue;
    const category = clean(raw.category).slice(0, LIMITS.category) || 'Menu';
    const k = key(category, name);
    if (seen.has(k)) { dupes++; continue; }
    seen.add(k);
    const flags = [...(raw.flags ?? [])];
    let price = raw.price_pence;
    if (price !== null && (!Number.isFinite(price) || price <= 0)) { price = null; }
    if (price !== null) { price = Math.round(price); if (price > LIMITS.maxPricePence) { price = null; flags.push('Price looked far too high, so it was left blank'); } else if (price > LIMITS.highPricePence) flags.push('Unusually high price: check it'); }
    if (price === null && !flags.some((f) => /price/i.test(f))) flags.push('No price found: enter one');
    if (name.length >= LIMITS.name) flags.push('Name was shortened');
    out.push({ name, description: clean(raw.description).slice(0, LIMITS.description), price_pence: price, category, dietary: [...new Set(raw.dietary)].filter((d) => (DIETARY as readonly string[]).includes(d)), allergens: [...new Set(raw.allergens)].filter((a) => (ALLERGENS as readonly string[]).includes(a)), flags });
  }
  const w = [...warnings];
  if (dupes) w.push(`${dupes} duplicate item${dupes === 1 ? ' was' : 's were'} left out.`);
  if (truncated) w.push(`Only the first ${LIMITS.maxItems} items are imported at a time. Import the rest in a second go.`);
  return { items: out, warnings: w, source, provider };
}

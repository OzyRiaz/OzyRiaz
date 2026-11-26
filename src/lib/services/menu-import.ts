import { getDb } from '../db';
import { aiAvailable, extractMenuWithClaude, MenuImportError, type AiInput } from '../menu-import/ai';
import { CommitSchema, LIMITS, type ImportedMenu } from '../menu-import/schema';
import { parseMenuText } from '../menu-import/text-parser';
import { rateLimit } from '../rate-limit';
import type { MenuCategory, MenuItem } from '../types';

export { MenuImportError };
export const MAX_FILE_BYTES = 4.5 * 1024 * 1024; // stays under hosting request limits (Netlify functions ~6 MB)

export interface PreviewRequest { restaurantId: string; userId: string; text?: string; file?: { mimeType: string; bytes: Buffer }; useAi?: boolean }

/** Decide what a file really is from its first bytes. The declared MIME type is not trusted. */
export function sniffFile(bytes: Buffer): { kind: 'image'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' } | { kind: 'pdf' } | null {
  if (bytes.length > 12 && bytes[0] === 0xff && bytes[1] === 0xd8) return { kind: 'image', mediaType: 'image/jpeg' };
  if (bytes.length > 12 && bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG') return { kind: 'image', mediaType: 'image/png' };
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return { kind: 'image', mediaType: 'image/webp' };
  if (bytes.length > 8 && bytes.toString('ascii', 0, 5) === '%PDF-') return { kind: 'pdf' };
  return null;
}

/** Builds a DRAFT menu from pasted text (free, no AI) or from a photo/PDF/messy text (AI, only if switched on). Saves nothing. */
export async function previewMenuImport(req: PreviewRequest, extract: typeof extractMenuWithClaude = extractMenuWithClaude): Promise<ImportedMenu> {
  const rl = rateLimit(`menuimport:${req.userId}`, 10, 60 * 60_000);
  if (!rl.ok) throw new MenuImportError(`You've imported a lot of menus in a short time. Please wait ${Math.ceil(rl.retryAfterSec / 60)} minutes and try again.`);

  const text = (req.text ?? '').trim();
  if (!req.file && !text) throw new MenuImportError('Paste your menu text or choose a photo or PDF first.');

  let input: AiInput | null = null;
  if (req.file) {
    if (!aiAvailable()) throw new MenuImportError('Reading photos and PDFs is not switched on yet. Please paste your menu as text for now.');
    if (req.file.bytes.length > MAX_FILE_BYTES) throw new MenuImportError('That file is too big (limit 4.5 MB). Use a smaller photo, or a screenshot.');
    const kind = sniffFile(req.file.bytes);
    if (!kind) throw new MenuImportError('Use a JPG, PNG or WebP photo, or a PDF.');
    input = kind.kind === 'pdf' ? { kind: 'pdf', data: req.file.bytes } : { kind: 'image', mediaType: kind.mediaType, data: req.file.bytes };
  } else if (req.useAi && aiAvailable()) {
    input = { kind: 'text', text };
  }
  if (!input) return parseMenuText(text);

  const cap = Number(process.env.MENU_IMPORT_DAILY_LIMIT) > 0 ? Number(process.env.MENU_IMPORT_DAILY_LIMIT) : 15; // protects the AI bill
  const day = rateLimit(`menuimport-ai:${req.restaurantId}`, cap, 24 * 60 * 60_000);
  if (!day.ok) throw new MenuImportError(`You've reached today's limit for AI menu reading (${cap}). You can still paste text, or try again tomorrow.`);
  return extract(input);
}

export async function listCategoryNames(restaurantId: string): Promise<string[]> {
  return (await (await getDb()).select<MenuCategory>('menu_categories', { restaurant_id: restaurantId }, { order: ['sort', 'asc'] })).map((c) => c.name);
}

export interface CommitResult { created: number; skipped: number; categoriesCreated: number }

/**
 * Saves the owner-reviewed items. The restaurant comes from the SESSION (caller), never from the form.
 * Items are saved HIDDEN (not orderable) unless the owner chose to publish, and allergen information is always saved as
 * NOT CONFIRMED: customers see "Ask restaurant about allergens" until the owner opens the item and confirms it.
 */
export async function commitMenuImport(restaurantId: string, raw: unknown): Promise<CommitResult> {
  const p = CommitSchema.safeParse(raw);
  if (!p.success) throw new MenuImportError(p.error.issues[0]?.message ?? 'Please check the items and try again');
  const db = await getDb();
  const cats = await db.select<MenuCategory>('menu_categories', { restaurant_id: restaurantId }, { order: ['sort', 'asc'] });
  const items = await db.select<MenuItem>('menu_items', { restaurant_id: restaurantId });
  const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
  const existing = new Set(items.map((i) => `${i.category_id}|${i.name.toLowerCase()}`));
  const nextSort = new Map<string, number>(); for (const i of items) nextSort.set(i.category_id, Math.max(nextSort.get(i.category_id) ?? 0, i.sort + 1));
  let created = 0, skipped = 0, categoriesCreated = 0, catSort = cats.length;
  for (const it of p.data.items) {
    let cat = catByName.get(it.category.toLowerCase());
    if (!cat) { cat = await db.insert<MenuCategory>('menu_categories', { restaurant_id: restaurantId, name: it.category.slice(0, LIMITS.category), sort: catSort++ }); catByName.set(it.category.toLowerCase(), cat); categoriesCreated++; }
    const k = `${cat.id}|${it.name.toLowerCase()}`;
    if (existing.has(k)) { skipped++; continue; }
    existing.add(k);
    const sort = nextSort.get(cat.id) ?? 0; nextSort.set(cat.id, sort + 1);
    await db.insert('menu_items', { restaurant_id: restaurantId, category_id: cat.id, name: it.name, description: it.description, price_pence: it.price_pence, image_url: null, available: p.data.publish, allergens: it.allergens, allergen_info_confirmed: false, dietary: it.dietary, option_groups: [], sort });
    created++;
  }
  return { created, skipped, categoriesCreated };
}

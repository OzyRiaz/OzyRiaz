import { getDb } from '../db';
import { isDemo } from '../config';
import { areaMatches, parsePostcode, parseOutwardOnly, postcodeInServedCity } from '../postcode';
import type { DeliveryArea, MenuCategory, MenuItem, Restaurant } from '../types';
import { isOpenNow } from '../hours';
import { getSettings } from './settings';

export type Availability = 'delivers' | 'collection_only' | 'unavailable' | 'unknown';

export interface RestaurantCard extends Restaurant {
  availability: Availability;
  delivery_fee_pence: number | null;
  open_now: boolean;
  has_member_offer: boolean;
}

export function matchArea(areas: DeliveryArea[], postcode: string): DeliveryArea | null {
  const full = parsePostcode(postcode);
  const outward = full?.outward ?? parseOutwardOnly(postcode);
  if (!outward) return null;
  const pc = { outward, sector: full?.sector };
  // A sector-level entry is more specific than an outward-level one.
  const hits = areas.filter((a) => a.postcode_prefixes.some((p) => areaMatches(p, pc)));
  return hits.find((a) => a.postcode_prefixes.some((p) => p.includes(' ') && areaMatches(p, pc))) ?? hits[0] ?? null;
}

export function availabilityFor(r: Restaurant, areas: DeliveryArea[], postcode: string | null): { availability: Availability; area: DeliveryArea | null } {
  if (!postcode) return { availability: 'unknown', area: null };
  const area = r.delivery_enabled ? matchArea(areas, postcode) : null;
  if (area) return { availability: 'delivers', area };
  if (r.collection_enabled) return { availability: 'collection_only', area: null };
  return { availability: 'unavailable', area: null };
}

export async function listRestaurants(opts: { postcode?: string | null; cuisine?: string | null; q?: string | null; featuredOnly?: boolean } = {}): Promise<RestaurantCard[]> {
  const db = await getDb();
  const [all0, areas, settings] = await Promise.all([db.select<Restaurant>('restaurants', { status: 'approved' }), db.select<DeliveryArea>('delivery_areas'), getSettings()]);
  const all = isDemo ? all0 : all0.filter((r) => !r.is_demo); // demonstration restaurants never appear in live mode
  const pc = opts.postcode?.trim() || null;
  const outward = pc ? parsePostcode(pc)?.outward ?? parseOutwardOnly(pc) : null;
  const served = outward ? !!postcodeInServedCity({ outward }) : true;
  const q = opts.q?.trim().toLowerCase();
  const out: RestaurantCard[] = [];
  for (const r of all) {
    if (opts.featuredOnly && !r.featured) continue;
    if (opts.cuisine && !r.cuisines.some((c) => c.toLowerCase() === opts.cuisine!.toLowerCase())) continue;
    if (q && !`${r.name} ${r.cuisines.join(' ')} ${r.description}`.toLowerCase().includes(q)) continue;
    const { availability, area } = availabilityFor(r, areas.filter((a) => a.restaurant_id === r.id), outward ? (pc as string) : null);
    if (outward && (!served || availability === 'unavailable')) continue; // only show restaurants that can serve this postcode
    out.push({ ...r, availability, delivery_fee_pence: area?.fee_pence ?? null, open_now: isOpenNow(r.opening_hours), has_member_offer: settings.feature_plus_enabled && r.member_offer.enabled });
  }
  return out.sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.open_now) - Number(a.open_now) || a.name.localeCompare(b.name));
}

export async function getRestaurantBySlug(slug: string) {
  const db = await getDb();
  const r = await db.get<Restaurant>('restaurants', { slug });
  return r ?? null;
}

export async function getMenu(restaurantId: string) {
  const db = await getDb();
  const [cats, items] = await Promise.all([
    db.select<MenuCategory>('menu_categories', { restaurant_id: restaurantId }, { order: ['sort', 'asc'] }),
    db.select<MenuItem>('menu_items', { restaurant_id: restaurantId }, { order: ['sort', 'asc'] }),
  ]);
  return cats.map((c) => ({ ...c, items: items.filter((i) => i.category_id === c.id) }));
}

export async function listCuisines(): Promise<{ name: string; count: number }[]> {
  const db = await getDb();
  const map = new Map<string, number>();
  for (const r of await db.select<Restaurant>('restaurants', { status: 'approved' })) for (const c of r.cuisines) map.set(c, (map.get(c) ?? 0) + 1);
  return [...map].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

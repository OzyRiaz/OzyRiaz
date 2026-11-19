import { CITIES, type City } from '../cities';
import { getDb } from '../db';

/** Cities come from the database (admin-editable). The static list in lib/cities.ts is only the fallback/seed. */
export async function getCities(): Promise<City[]> {
  const rows = await (await getDb()).select<City>('cities');
  return rows.length ? rows.map((c) => ({ slug: c.slug, name: c.name, areas: c.areas, active: c.active })) : CITIES;
}
export const getActiveCities = async () => (await getCities()).filter((c) => c.active);

export class CityError extends Error {}
export async function upsertCity(c: { slug: string; name: string; areas: string[] }) {
  if (!/^[a-z0-9-]{2,40}$/.test(c.slug)) throw new CityError('Slug: lowercase letters, numbers and dashes');
  const areas = c.areas.map((a) => a.trim().toUpperCase()).filter(Boolean);
  if (!areas.length || areas.some((a) => !/^[A-Z]{1,2}$/.test(a))) throw new CityError('Postcode areas are 1–2 letters, e.g. BD, LS, M');
  const db = await getDb();
  const existing = await db.get('cities', { slug: c.slug });
  if (existing) await db.update('cities', { slug: c.slug }, { name: c.name, areas });
  else await db.insert('cities', { slug: c.slug, name: c.name, areas, active: false }); // new cities start INACTIVE
}
export async function setCityActive(slug: string, active: boolean) {
  const db = await getDb();
  if (!(await db.get('cities', { slug }))) throw new CityError('Unknown city');
  await db.update('cities', { slug }, { active });
}

'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { ALLERGENS, DIETARY } from '@/lib/allergens';
import { getDb } from '@/lib/db';
import type { FormState } from '@/lib/form';
import { DAY_KEYS } from '@/lib/hours';
import { parsePounds } from '@/lib/money';
import { parseOptions } from '@/lib/menu-options';
import { parsePostcode } from '@/lib/postcode';
import { startConnectOnboarding } from '@/lib/services/connect';
import { OrderError, updateOrderStatus } from '@/lib/services/orders';
import type { DeliveryArea, MenuItem, OpeningHours, OptionGroup, OrderStatus, Profile, Restaurant, RestaurantStaff } from '@/lib/types';

/** Every dashboard mutation resolves the restaurant from the SESSION, never from form input. */
async function ctx() {
  const s = await requireSession('/dashboard');
  const id = s.restaurantIds[0];
  if (!id || s.role !== 'restaurant') redirect('/dashboard');
  return { s, rid: id, db: await getDb() };
}

export async function orderStatusAction(fd: FormData) {
  const { s } = await ctx();
  try {
    await updateOrderStatus(String(fd.get('id')), String(fd.get('to')) as OrderStatus, s, { reason: String(fd.get('reason') ?? '') });
  } catch (e) {
    if (e instanceof OrderError) redirect(`/dashboard?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath('/dashboard');
}

const money = z.string().transform((v, c) => { const p = parsePounds(v); if (p === null) { c.addIssue({ code: 'custom', message: 'Enter a valid price, e.g. 9.50' }); return z.NEVER; } return p; });

export async function saveItemAction(_: FormState, fd: FormData): Promise<FormState> {
  const { rid, db } = await ctx();
  const p = z.object({ id: z.string().optional(), name: z.string().trim().min(2, 'Item name is required').max(80), description: z.string().trim().max(300), price: money, category_id: z.string().min(1, 'Choose a category'), image_url: z.string().max(3_000_000).optional(), options: z.string().max(4000).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const cat = await db.get('menu_categories', { id: p.data.category_id, restaurant_id: rid });
  if (!cat) return { error: 'Invalid category' };
  let option_groups: OptionGroup[];
  try { option_groups = parseOptions(p.data.options ?? ''); } catch (e) { return { error: (e as Error).message }; }
  const allergens = fd.getAll('allergens').map(String).filter((a) => (ALLERGENS as readonly string[]).includes(a));
  const dietary = fd.getAll('dietary').map(String).filter((a) => (DIETARY as readonly string[]).includes(a));
  if (fd.get('confirm') !== 'on') return { error: 'Please confirm the allergen information is accurate (tick “none” boxes only if the item truly contains none)' };
  const row = { name: p.data.name, description: p.data.description, price_pence: p.data.price, category_id: p.data.category_id, image_url: p.data.image_url || null, available: fd.get('available') === 'on', allergens, dietary, allergen_info_confirmed: true, option_groups };
  if (p.data.id) { const u = await db.update('menu_items', { id: p.data.id, restaurant_id: rid }, row); if (!u.length) return { error: 'Item not found' }; }
  else await db.insert('menu_items', { restaurant_id: rid, sort: 99, ...row });
  revalidatePath('/dashboard/menu');
  redirect('/dashboard/menu');
}

export async function toggleItemAction(fd: FormData) {
  const { rid, db } = await ctx();
  const it = await db.get<MenuItem>('menu_items', { id: String(fd.get('id')), restaurant_id: rid });
  if (it) await db.update('menu_items', { id: it.id, restaurant_id: rid }, { available: !it.available });
  revalidatePath('/dashboard/menu');
}
export async function deleteItemAction(fd: FormData) {
  const { rid, db } = await ctx();
  await db.delete('menu_items', { id: String(fd.get('id')), restaurant_id: rid });
  revalidatePath('/dashboard/menu');
}
export async function addCategoryAction(_: FormState, fd: FormData): Promise<FormState> {
  const { rid, db } = await ctx();
  const name = String(fd.get('name') ?? '').trim();
  if (name.length < 2) return { error: 'Enter a category name' };
  const n = (await db.select('menu_categories', { restaurant_id: rid })).length;
  await db.insert('menu_categories', { restaurant_id: rid, name: name.slice(0, 40), sort: n });
  revalidatePath('/dashboard/menu');
  return { ok: 'Category added' };
}

export async function saveProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const { rid, db } = await ctx();
  const p = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().min(10, 'Add a short description').max(400), cuisines: z.string().trim().min(2), address_line1: z.string().trim().min(3), postcode: z.string(), phone: z.string().trim().min(7).max(20), email: z.string().trim().email(), image_url: z.string().max(3_000_000).optional(), legal_name: z.string().trim().max(120).optional(), company_number: z.string().trim().max(20).optional(), vat_registered: z.enum(['yes', 'no']).optional(), vat_number: z.string().trim().max(20).optional(), food_business_reg: z.string().trim().max(60).optional(), food_hygiene_rating: z.string().regex(/^[0-5]?$/).optional(), food_hygiene_authority: z.string().trim().max(80).optional(), prep_minutes: z.coerce.number().int().min(5).max(120), min_order: money }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const pc = parsePostcode(p.data.postcode);
  if (!pc) return { error: 'Enter a valid UK postcode' };
  const hours = {} as OpeningHours;
  for (const d of DAY_KEYS) {
    if (fd.get(`${d}_closed`) === 'on') { hours[d] = []; continue; }
    const open = String(fd.get(`${d}_open`)), close = String(fd.get(`${d}_close`));
    if (!/^\d\d:\d\d$/.test(open) || !/^\d\d:\d\d$/.test(close)) return { error: `Check opening times for ${d}` };
    hours[d] = [{ open, close }];
  }
  await db.update('restaurants', { id: rid }, { name: p.data.name, description: p.data.description, cuisines: p.data.cuisines.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 4), address_line1: p.data.address_line1, postcode: pc.normalised, phone: p.data.phone, email: p.data.email, image_url: p.data.image_url || null, legal_name: p.data.legal_name || null, company_number: p.data.company_number || null, vat_registered: p.data.vat_registered === 'yes', vat_number: p.data.vat_number || null, food_business_reg: p.data.food_business_reg || null, food_hygiene_rating: p.data.food_hygiene_rating ? Number(p.data.food_hygiene_rating) : null, food_hygiene_authority: p.data.food_hygiene_authority || null, prep_minutes: p.data.prep_minutes, min_order_pence: p.data.min_order, opening_hours: hours });
  revalidatePath('/dashboard/profile');
  return { ok: 'Profile saved' };
}

export async function saveFulfilmentAction(_: FormState, fd: FormData): Promise<FormState> {
  const { rid, db } = await ctx();
  await db.update('restaurants', { id: rid }, { delivery_enabled: fd.get('delivery') === 'on', collection_enabled: fd.get('collection') === 'on' });
  revalidatePath('/dashboard/delivery');
  return { ok: 'Saved' };
}
export async function addAreaAction(_: FormState, fd: FormData): Promise<FormState> {
  const { rid, db } = await ctx();
  const p = z.object({ name: z.string().trim().min(2).max(60), prefixes: z.string().trim().min(2), fee: money, min: z.string().optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const prefixes = p.data.prefixes.toUpperCase().split(/[,\s]+/).filter(Boolean).map((x) => x.replace(/^([A-Z]{1,2}\d[A-Z\d]?)(\d)$/, '$1 $2'));
  const bad = prefixes.find((x) => !/^[A-Z]{1,2}\d[A-Z\d]?( \d)?$/.test(x));
  if (bad) return { error: `"${bad}" isn't a valid area. Use outward codes like BD5, or sectors like "BD5 0".` };
  const min = p.data.min ? parsePounds(p.data.min) : null;
  await db.insert('delivery_areas', { restaurant_id: rid, name: p.data.name, postcode_prefixes: prefixes.slice(0, 40), fee_pence: p.data.fee, min_order_pence: min });
  revalidatePath('/dashboard/delivery');
  return { ok: 'Delivery area added' };
}
export async function deleteAreaAction(fd: FormData) {
  const { rid, db } = await ctx();
  await db.delete('delivery_areas', { id: String(fd.get('id')), restaurant_id: rid });
  revalidatePath('/dashboard/delivery');
}

export async function saveOfferAction(_: FormState, fd: FormData): Promise<FormState> {
  const { rid, db } = await ctx();
  const p = z.object({ percent: z.coerce.number().min(0).max(50), min: money, description: z.string().max(120) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  await db.update('restaurants', { id: rid }, { member_offer: { enabled: fd.get('enabled') === 'on' && p.data.percent > 0, percent: p.data.percent, min_spend_pence: p.data.min, description: p.data.description } });
  revalidatePath('/dashboard/offers');
  return { ok: 'Member offer saved' };
}

export async function addStaffAction(_: FormState, fd: FormData): Promise<FormState> {
  const { rid, db } = await ctx();
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const role = fd.get('role') === 'manager' ? 'manager' : 'staff';
  const u = await db.get<Profile>('profiles', { email });
  if (!u) return { error: 'No FeastQuarter account with that email. Ask them to register first.' };
  if (u.role === 'admin') return { error: 'That account cannot be added' };
  const existing = await db.select<RestaurantStaff>('restaurant_staff', { user_id: u.id });
  if (existing.length) return { error: existing.some((e) => e.restaurant_id === rid) ? 'Already on your team' : 'That person already works with another restaurant' };
  await db.insert('restaurant_staff', { restaurant_id: rid, user_id: u.id, role });
  if (u.role === 'customer') await db.update('profiles', { id: u.id }, { role: 'restaurant' });
  revalidatePath('/dashboard/staff');
  return { ok: `${u.full_name} added as ${role}` };
}
export async function removeStaffAction(fd: FormData) {
  const { s, rid, db } = await ctx();
  const row = await db.get<RestaurantStaff>('restaurant_staff', { id: String(fd.get('id')), restaurant_id: rid });
  if (!row || row.role === 'owner' || row.user_id === s.userId) return;
  await db.delete('restaurant_staff', { id: row.id, restaurant_id: rid });
  await db.update('profiles', { id: row.user_id, role: 'restaurant' }, { role: 'customer' });
  revalidatePath('/dashboard/staff');
}

export async function connectOnboardAction() {
  const { rid, db } = await ctx();
  const r = (await db.get<Restaurant>('restaurants', { id: rid }))!;
  if (r.status !== 'approved') redirect('/dashboard/payments?error=Your+application+must+be+approved+first');
  let url: string;
  try { ({ url } = await startConnectOnboarding(r)); } catch (e) { redirect(`/dashboard/payments?error=${encodeURIComponent((e as Error).message)}`); }
  redirect(url);
}


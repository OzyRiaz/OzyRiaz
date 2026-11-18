'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { getDb, DuplicateError } from '@/lib/db';
import type { FormState } from '@/lib/form';
import { parsePounds } from '@/lib/money';
import { notify } from '@/lib/services/notify';
import { OrderError, refundOrder } from '@/lib/services/orders';
import type { Profile, Restaurant } from '@/lib/types';

const admin = async () => { const s = await requireRole('admin', '/admin'); return { s, db: await getDb() }; };

export async function restaurantStatusAction(fd: FormData) {
  const { db } = await admin();
  const to = String(fd.get('to'));
  if (!['approved', 'rejected', 'suspended', 'pending'].includes(to)) return;
  const [r] = await db.update<Restaurant>('restaurants', { id: String(fd.get('id')) }, { status: to });
  if (r && (to === 'approved' || to === 'rejected')) await notify({ kind: 'restaurant_onboarding', to: r.email, subject: to === 'approved' ? 'Welcome to BD Feast — you’re approved' : 'Your BD Feast application', body: to === 'approved' ? `${r.name} is approved. Next: complete Stripe onboarding in your dashboard (Payments) so you can take orders.` : `Unfortunately we can't approve ${r.name} at this time. Contact support if you'd like to discuss this.` });
  revalidatePath('/admin/restaurants');
}
export async function featureAction(fd: FormData) {
  const { db } = await admin();
  const r = await db.get<Restaurant>('restaurants', { id: String(fd.get('id')) });
  if (r) await db.update('restaurants', { id: r.id }, { featured: !r.featured });
  revalidatePath('/admin/restaurants');
}
export async function suspendUserAction(fd: FormData) {
  const { s, db } = await admin();
  const id = String(fd.get('id'));
  if (id === s.userId) return; // can't lock yourself out
  const p = await db.get<Profile>('profiles', { id });
  if (!p || p.role === 'admin') return;
  await db.update('profiles', { id }, { suspended: !p.suspended });
  revalidatePath('/admin/customers');
}
export async function refundAction(_: FormState, fd: FormData): Promise<FormState> {
  const { s } = await admin();
  const amount = parsePounds(String(fd.get('amount')));
  const reason = String(fd.get('reason') ?? '').trim();
  if (amount === null || amount <= 0) return { error: 'Enter a refund amount' };
  if (reason.length < 3) return { error: 'Give a reason' };
  try { await refundOrder(String(fd.get('id')), amount, reason, s.userId); } catch (e) { if (e instanceof OrderError) return { error: e.message }; return { error: 'Stripe refused the refund: ' + (e as Error).message }; }
  revalidatePath('/admin/orders');
  return { ok: 'Refund issued' };
}

export async function saveSettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  const { db } = await admin();
  const pct = z.coerce.number().min(0).max(30);
  const p = z.object({ delivery: pct, collection: pct, price: z.string(), maxp: z.coerce.number().min(0).max(50), funding: z.enum(['restaurant', 'platform']), benefits: z.string().max(1000) }).safeParse(Object.fromEntries(fd));
  const price = p.success ? parsePounds(p.data.price) : null;
  if (!p.success || price === null || price < 100) return { error: p.success ? 'Membership price must be at least £1.00' : 'Check the values (commission 0–30%, max member discount 0–50%)' };
  await db.update('platform_settings', { id: 'main' }, { commission_delivery_bps: Math.round(p.data.delivery * 100), commission_collection_bps: Math.round(p.data.collection * 100), membership_price_pence: price, member_discount_max_percent: p.data.maxp, member_discount_funding: p.data.funding, membership_benefits: p.data.benefits.split('\n').map((b) => b.trim()).filter(Boolean).slice(0, 8) });
  revalidatePath('/admin/settings');
  return { ok: 'Settings saved. Commission changes apply to new orders only; existing orders keep the rate they were placed at.' };
}

export async function createPromoAction(_: FormState, fd: FormData): Promise<FormState> {
  const { db } = await admin();
  const p = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, 'Code: 3–20 letters, numbers or dashes'), description: z.string().trim().min(3).max(120), kind: z.enum(['percent', 'fixed']), value: z.string(), min: z.string(), max_uses: z.string().optional(), ends: z.string().optional(), funded_by: z.enum(['platform', 'restaurant']) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const value = p.data.kind === 'percent' ? Number(p.data.value) : parsePounds(p.data.value);
  const min = parsePounds(p.data.min || '0');
  if (value === null || !Number.isFinite(value) || value <= 0 || (p.data.kind === 'percent' && value > 100) || min === null) return { error: 'Check the discount value' };
  try {
    await db.insert('promotions', { code: p.data.code, description: p.data.description, kind: p.data.kind, value, min_spend_pence: min, active: true, starts_at: null, ends_at: p.data.ends ? new Date(p.data.ends + 'T23:59:59').toISOString() : null, max_uses: p.data.max_uses ? Math.max(1, Number(p.data.max_uses)) : null, used_count: 0, funded_by: p.data.funded_by, restaurant_id: null });
  } catch (e) { if (e instanceof DuplicateError) return { error: 'That code already exists' }; throw e; }
  revalidatePath('/admin/promotions');
  return { ok: 'Promotion created' };
}
export async function togglePromoAction(fd: FormData) {
  const { db } = await admin();
  const p = await db.get<{ id: string; active: boolean }>('promotions', { id: String(fd.get('id')) });
  if (p) await db.update('promotions', { id: p.id }, { active: !p.active });
  revalidatePath('/admin/promotions');
}


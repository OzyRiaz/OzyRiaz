'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { getDb, DuplicateError } from '@/lib/db';
import type { FormState } from '@/lib/form';
import { parsePounds } from '@/lib/money';
import { notify } from '@/lib/services/notify';
import { reconcileStripeFees } from '@/lib/services/reconcile';
import { setWeeklyPayouts } from '@/lib/services/payouts';
import { recoverDisputeFromRestaurant } from '@/lib/services/disputes';
import { CityError, setCityActive, upsertCity } from '@/lib/services/cities';
import { applySettingsChange, SettingsError } from '@/lib/services/settings';
import { OrderError, refundOrder } from '@/lib/services/orders';
import type { Profile, Restaurant } from '@/lib/types';

const admin = async () => { const s = await requireRole('admin', '/admin'); return { s, db: await getDb() }; };

export async function restaurantStatusAction(fd: FormData) {
  const { db } = await admin();
  const to = String(fd.get('to'));
  if (!['approved', 'rejected', 'suspended', 'pending'].includes(to)) return;
  if (to === 'approved') {
    const cand = await db.get<Restaurant>('restaurants', { id: String(fd.get('id')) });
    // Verification gate: real (non-demo) restaurants need legal + food-business details on file before approval.
    if (cand && !cand.is_demo && (!cand.legal_name || !cand.food_business_reg)) redirect('/admin/restaurants?error=' + encodeURIComponent(`${cand.name} cannot be approved yet: legal business name and food business registration are missing.`));
  }
  const [r] = await db.update<Restaurant>('restaurants', { id: String(fd.get('id')) }, { status: to });
  if (r && (to === 'approved' || to === 'rejected')) await notify({ kind: 'restaurant_onboarding', to: r.email, subject: to === 'approved' ? 'Welcome to FeastQuarter — you’re approved' : 'Your FeastQuarter application', body: to === 'approved' ? `${r.name} is approved. Next: complete Stripe onboarding in your dashboard (Payments) so you can take orders.` : `Unfortunately we can't approve ${r.name} at this time. Contact support if you'd like to discuss this.` });
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
  const { s } = await admin();
  const p = z.object({
    commission: z.coerce.number().min(0).max(30), price: z.string(), maxp: z.coerce.number().min(0).max(50), funding: z.enum(['restaurant', 'platform']),
    benefits: z.string().max(1000), reason: z.string().max(300).default(''),
    vat_threshold: z.string(), vat_rate: z.coerce.number().min(0).max(30), vat_mode: z.enum(['none', 'inclusive', 'exclusive']),
  }).safeParse(Object.fromEntries(fd));
  const price = p.success ? parsePounds(p.data.price) : null;
  const threshold = p.success ? parsePounds(p.data.vat_threshold) : null;
  if (!p.success || price === null || price < 100 || threshold === null) return { error: p.success ? 'Membership price must be at least £1.00' : 'Check the values (commission 0–30%, max member discount 0–50%)' };
  try {
    const { changed } = await applySettingsChange(s.userId, {
      commission_bps: Math.round(p.data.commission * 100), membership_price_pence: price, member_discount_max_percent: p.data.maxp, member_discount_funding: p.data.funding,
      membership_benefits: p.data.benefits.split('\n').map((b) => b.trim()).filter(Boolean).slice(0, 8),
      platform_vat_registered: fd.get('vat_registered') === 'on', vat_threshold_pence: threshold, vat_rate_bps: Math.round(p.data.vat_rate * 100), commission_vat_mode: p.data.vat_mode,
      feature_plus_enabled: fd.get('plus_enabled') === 'on',
    }, p.data.reason);
    revalidatePath('/admin/settings');
    return { ok: changed.length ? 'Settings saved and recorded in the audit log. Commission changes apply to NEW orders only; every existing order keeps the rate it was placed at.' : 'No changes to save.' };
  } catch (e) {
    if (e instanceof SettingsError) return { error: e.message };
    throw e;
  }
}

export async function createPromoAction(_: FormState, fd: FormData): Promise<FormState> {
  const { db } = await admin();
  const p = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, 'Code: 3–20 letters, numbers or dashes'), description: z.string().trim().min(3).max(120), kind: z.enum(['percent', 'fixed']), value: z.string(), min: z.string(), max_uses: z.string().optional(), ends: z.string().optional(), funded_by: z.enum(['platform', 'restaurant']), city: z.string().optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const value = p.data.kind === 'percent' ? Number(p.data.value) : parsePounds(p.data.value);
  const min = parsePounds(p.data.min || '0');
  if (value === null || !Number.isFinite(value) || value <= 0 || (p.data.kind === 'percent' && value > 100) || min === null) return { error: 'Check the discount value' };
  try {
    await db.insert('promotions', { code: p.data.code, description: p.data.description, kind: p.data.kind, value, min_spend_pence: min, active: true, starts_at: null, ends_at: p.data.ends ? new Date(p.data.ends + 'T23:59:59').toISOString() : null, max_uses: p.data.max_uses ? Math.max(1, Number(p.data.max_uses)) : null, used_count: 0, funded_by: p.data.funded_by, restaurant_id: null, city_slug: p.data.city || null });
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


export async function addExpenseAction(_: FormState, fd: FormData): Promise<FormState> {
  const { s, db } = await admin();
  const p = z.object({ kind: z.enum(['stripe_connect_account', 'stripe_payout', 'stripe_other', 'other']), amount: z.string(), incurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'), note: z.string().trim().max(200).default('') }).safeParse(Object.fromEntries(fd));
  const amount = p.success ? parsePounds(p.data.amount) : null;
  if (!p.success || amount === null || amount <= 0) return { error: p.success ? 'Enter an amount' : p.error.issues[0].message };
  await db.insert('platform_expenses', { kind: p.data.kind, amount_pence: amount, incurred_on: new Date(p.data.incurred_on + 'T12:00:00Z').toISOString(), note: p.data.note, created_by: s.userId });
  revalidatePath('/admin/finance'); revalidatePath('/admin');
  return { ok: 'Cost recorded' };
}
export async function reconcileFeesAction(): Promise<void> {
  await admin();
  await reconcileStripeFees();
  revalidatePath('/admin/finance'); revalidatePath('/admin');
}

export async function weeklyPayoutsAction(fd: FormData): Promise<void> {
  const { db } = await admin();
  const r = await db.get<Restaurant>('restaurants', { id: String(fd.get('id')) });
  if (!r) return;
  try { await setWeeklyPayouts(r); } catch { /* surfaced in Stripe/logs; admins can retry */ }
  revalidatePath('/admin/restaurants');
}

export async function setCityActiveAction(fd: FormData): Promise<void> {
  await admin();
  try { await setCityActive(String(fd.get('slug')), fd.get('active') === 'true'); } catch { /* unknown city */ }
  revalidatePath('/admin/locations'); revalidatePath('/');
}
export async function upsertCityAction(_: FormState, fd: FormData): Promise<FormState> {
  await admin();
  try {
    await upsertCity({ slug: String(fd.get('slug') ?? '').trim().toLowerCase(), name: String(fd.get('name') ?? '').trim().slice(0, 60), areas: String(fd.get('areas') ?? '').split(/[,\s]+/) });
  } catch (e) { if (e instanceof CityError) return { error: e.message }; throw e; }
  revalidatePath('/admin/locations');
  return { ok: 'City saved (new cities start inactive — activate when ready).' };
}

export async function recoverDisputeAction(_: FormState, fd: FormData): Promise<FormState> {
  const { s } = await admin();
  const amount = parsePounds(String(fd.get('amount')));
  if (amount === null) return { error: 'Enter an amount' };
  try { await recoverDisputeFromRestaurant(String(fd.get('order')), amount, s.userId); } catch (e) { return { error: (e as Error).message }; }
  revalidatePath('/admin/finance');
  return { ok: 'Transfer reversed: funds recovered from the restaurant.' };
}

'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { clientIp, rateLimit, TOO_MANY } from '@/lib/rate-limit';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getSession, requireSession } from '@/lib/auth/session';
import { demoPaymentsEnabled } from '@/lib/config';
import { getDb } from '@/lib/db';
import type { FormState } from '@/lib/form';
import { parsePostcode } from '@/lib/postcode';
import { cancelMembership, startMembershipCheckout } from '@/lib/services/membership';
import { cancelOrderByCustomer, createOrder, createPaymentSession, markOrderPaid, OrderError } from '@/lib/services/orders';
import { buildQuote, QuoteError, type Quote } from '@/lib/services/quote';
import { priceLine } from '@/lib/pricing';
import { notify } from '@/lib/services/notify';
import type { Address, Profile } from '@/lib/types';
import { activateMembership } from '@/lib/services/membership';
import { plusEnabled } from '@/lib/services/settings';

const lineSchema = z.object({ itemId: z.string().min(1), qty: z.number().int().min(1).max(50), optionChoiceIds: z.array(z.string()).max(30), note: z.string().max(200).nullish() });
const quoteSchema = z.object({
  restaurantId: z.string().min(1), lines: z.array(lineSchema).min(1).max(60), fulfilment: z.enum(['delivery', 'collection']),
  postcode: z.string().max(10).nullish(), promoCode: z.string().max(40).nullish(), tipPence: z.number().int().min(0).max(10000).nullish(),
});

export type QuoteResult = { ok: true; quote: Omit<Quote, 'restaurant'> & { restaurantName: string; restaurantSlug: string; minOrderPence: number } } | { ok: false; error: string };

export async function quoteAction(raw: unknown): Promise<QuoteResult> {
  const p = quoteSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: 'Your basket could not be read. Please refresh.' };
  const s = await getSession();
  try {
    const { restaurant, ...q } = await buildQuote({ ...p.data, userId: s?.userId });
    return { ok: true, quote: { ...q, restaurantName: restaurant.name, restaurantSlug: restaurant.slug, minOrderPence: restaurant.min_order_pence } };
  } catch (e) {
    if (e instanceof QuoteError) return { ok: false, error: e.message };
    throw e;
  }
}

const placeSchema = quoteSchema.extend({
  idempotencyKey: z.string().min(8).max(100),
  address: z.object({ line1: z.string().trim().min(3).max(120), line2: z.string().trim().max(120).nullish(), city: z.string().trim().min(2).max(60), postcode: z.string() }).nullish(),
  phone: z.string().trim().min(7, 'Enter a contact phone number').max(20),
  note: z.string().max(500).nullish(),
  ackAllergens: z.literal(true, { error: 'Please confirm you have read the allergen notice' }),
});

export async function placeOrderAction(raw: unknown): Promise<{ url: string } | { error: string }> {
  const s = await getSession();
  if (!s) return { error: 'Please sign in to place your order' };
  const rl = rateLimit(`order:${s.userId}`, 12, 10 * 60_000);
  if (!rl.ok) return { error: TOO_MANY(rl.retryAfterSec) };
  const p = placeSchema.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Please check your details' };
  const d = p.data;
  try {
    let address = null;
    if (d.fulfilment === 'delivery') {
      const pc = parsePostcode(d.address?.postcode ?? '');
      if (!d.address || !pc) return { error: 'Enter a valid delivery address and postcode' };
      address = { ...d.address, postcode: pc.normalised };
    }
    let source: string | null = null, campaign: string | null = null;
    try { const raw = (await cookies()).get('fq_attr')?.value; if (raw) { const a = JSON.parse(decodeURIComponent(raw)); source = String(a.src ?? '').slice(0, 40) || null; campaign = String(a.campaign ?? '').slice(0, 60) || null; } } catch { /* ignore malformed */ }
    const order = await createOrder({ source, campaign, user: s, restaurantId: d.restaurantId, lines: d.lines, fulfilment: d.fulfilment, address, note: d.note, phone: d.phone, promoCode: d.promoCode || null, tipPence: d.tipPence ?? 0, idempotencyKey: d.idempotencyKey });
    if (order.payment_status === 'paid') return { url: `/orders/${order.id}` };
    const { url } = await createPaymentSession(order, s.email);
    return { url };
  } catch (e) {
    if (e instanceof QuoteError || e instanceof OrderError) return { error: e.message };
    console.error('placeOrder failed', e);
    return { error: 'We could not start your payment. Please try again.' };
  }
}

/** DEMO ONLY: simulates the payment provider's webhook so the whole flow can be demonstrated without Stripe. */
export async function demoPayAction(fd: FormData) {
  if (!demoPaymentsEnabled()) throw new Error('Simulated payments are disabled');
  const s = await requireSession();
  const orderId = String(fd.get('order'));
  const o = await (await getDb()).get<{ id: string; customer_id: string; total_pence: number }>('orders', { id: orderId });
  if (!o || o.customer_id !== s.userId) throw new Error('Order not found');
  await markOrderPaid(o.id, { amountPence: o.total_pence, paymentIntentId: `pi_demo_${o.id.slice(0, 8)}`, source: 'demo' });
  redirect(`/checkout/success?order=${o.id}`);
}

export async function demoMembershipAction() {
  if (!demoPaymentsEnabled()) throw new Error('Simulated payments are disabled');
  if (!(await plusEnabled())) redirect('/plus');
  const s = await requireSession('/plus');
  const end = new Date(Date.now() + 30 * 864e5);
  await activateMembership(s.userId, { customerId: `cus_demo_${s.userId.slice(0, 6)}`, subscriptionId: `sub_demo_${s.userId.slice(0, 6)}`, periodEnd: end });
  const db = await getDb();
  await db.insert('transactions', { kind: 'membership_payment', order_id: null, user_id: s.userId, restaurant_id: null, amount_pence: 499, status: 'succeeded', stripe_ref: `in_demo_${Date.now()}`, note: 'Simulated demo payment' });
  redirect('/plus?status=success');
}

export async function joinMembershipAction() {
  const s = await requireSession('/plus');
  if (!(await plusEnabled())) redirect('/plus');
  const db = await getDb();
  const user = (await db.get<Profile>('profiles', { id: s.userId }))!;
  let url: string;
  try { ({ url } = await startMembershipCheckout(user)); } catch (e) { redirect(`/plus?status=unavailable&msg=${encodeURIComponent((e as Error).message)}`); }
  redirect(url);
}

export async function cancelMembershipAction(_: FormState): Promise<FormState> {
  const s = await requireSession('/plus');
  try { await cancelMembership(s.userId); } catch (e) { return { error: (e as Error).message }; }
  revalidatePath('/plus');
  return { ok: 'Your membership will end at the close of the current billing period.' };
}

const addrSchema = z.object({ label: z.string().trim().min(1).max(30), line1: z.string().trim().min(3).max(120), line2: z.string().trim().max(120).optional(), city: z.string().trim().min(2).max(60), postcode: z.string() });
export async function addAddressAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession('/account');
  const p = addrSchema.safeParse(Object.fromEntries(fd));
  const pc = p.success ? parsePostcode(p.data.postcode) : null;
  if (!p.success || !pc) return { error: p.success ? 'Enter a valid UK postcode' : p.error.issues[0].message };
  await (await getDb()).insert('addresses', { user_id: s.userId, ...p.data, line2: p.data.line2 || null, postcode: pc.normalised });
  revalidatePath('/account');
  return { ok: 'Address saved' };
}
export async function deleteAddressAction(fd: FormData) {
  const s = await requireSession('/account');
  await (await getDb()).delete('addresses', { id: String(fd.get('id')), user_id: s.userId });
  revalidatePath('/account');
}
export async function updateProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession('/account');
  const p = z.object({ full_name: z.string().trim().min(2).max(80), phone: z.string().trim().max(20).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: 'Please enter your name' };
  await (await getDb()).update('profiles', { id: s.userId }, { full_name: p.data.full_name, phone: p.data.phone || null });
  revalidatePath('/account');
  return { ok: 'Profile updated' };
}

export async function supportAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await getSession();
  const rl = rateLimit(`support:${s?.userId ?? (await clientIp())}`, 5, 60 * 60_000);
  if (!rl.ok) return { error: TOO_MANY(rl.retryAfterSec) };
  const p = z.object({ email: z.string().trim().email('Enter a valid email'), subject: z.string().trim().min(3, 'Add a subject').max(120), message: z.string().trim().min(10, 'Please add a few more details').max(2000) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  await (await getDb()).insert('support_tickets', { user_id: s?.userId ?? null, ...p.data, status: 'open' });
  return { ok: 'Thanks — your message has been recorded. We reply by email.' };
}

/** GDPR erasure: removes personal data, keeps financial records (legal retention) in anonymised form. */
export async function deleteAccountAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession('/account');
  if (String(fd.get('confirm')).trim().toUpperCase() !== 'DELETE') return { error: 'Type DELETE to confirm' };
  if (s.role !== 'customer') return { error: 'Restaurant and admin accounts must be closed by FeastQuarter support so payouts and records are handled correctly.' };
  const db = await getDb();
  const active = (await db.select<{ status: string; payment_status: string }>('orders', { customer_id: s.userId })).some((o) => o.payment_status === 'paid' && ['awaiting_restaurant', 'accepted', 'preparing', 'ready', 'out_for_delivery'].includes(o.status));
  if (active) return { error: 'You have an order in progress. Please wait until it is complete.' };
  try { await cancelMembership(s.userId); } catch { /* none active */ }
  await db.delete('addresses', { user_id: s.userId });
  await db.update('orders', { customer_id: s.userId }, { delivery_address: null, contact_phone: null, customer_note: null });
  await db.update('profiles', { id: s.userId }, { email: `deleted-${s.userId}@deleted.invalid`, full_name: 'Deleted customer', phone: null, deleted_at: new Date().toISOString() });
  await db.delete('demo_credentials', { user_id: s.userId });
  const { logoutAction } = await import('@/lib/auth/actions');
  await logoutAction();
  return undefined;
}

/** Customer cancels a paid order that the restaurant has not accepted yet (full refund per the admin policy). */
export async function cancelOrderAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession('/orders');
  const rl = rateLimit(`cancelorder:${s.userId}`, 10, 60 * 60_000);
  if (!rl.ok) return { error: TOO_MANY(rl.retryAfterSec) };
  const id = String(fd.get('order') ?? '');
  try { await cancelOrderByCustomer(id, s.userId); } catch (e) { if (e instanceof OrderError) return { error: e.message }; return { error: 'We could not cancel this order just now. Please try again or contact support.' }; }
  revalidatePath(`/orders/${id}`);
  return { ok: 'Order cancelled. Your refund is on its way and can take 5–10 working days to appear.' };
}

/** Customer asks for a refund on a paid order. Creates a support ticket linked to the order for admin review (no automatic refund). */
export async function requestRefundAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession('/orders');
  const rl = rateLimit(`refundreq:${s.userId}`, 5, 60 * 60_000);
  if (!rl.ok) return { error: TOO_MANY(rl.retryAfterSec) };
  const reason = String(fd.get('reason') ?? '').trim();
  if (reason.length < 10) return { error: 'Please tell us what went wrong (at least a sentence).' };
  const db = await getDb();
  const o = await db.get<{ id: string; reference: string; customer_id: string; payment_status: string; total_pence: number; refunded_pence: number }>('orders', { id: String(fd.get('order')) });
  if (!o || o.customer_id !== s.userId) return { error: 'Order not found' };
  if (!['paid', 'partially_refunded'].includes(o.payment_status) || o.refunded_pence >= o.total_pence) return { error: 'This order is not eligible for a refund request.' };
  const dup = (await db.select<{ status: string }>('support_tickets', { order_id: o.id, kind: 'refund_request' })).some((t) => t.status === 'open');
  if (dup) return { error: 'You already have an open refund request for this order. We will reply by email.' };
  await db.insert('support_tickets', { user_id: s.userId, email: s.email, subject: `Refund request: ${o.reference}`, message: reason.slice(0, 2000), status: 'open', order_id: o.id, kind: 'refund_request' });
  if (process.env.ADMIN_NOTIFY_EMAIL) await notify({ kind: 'refund_request_admin', to: process.env.ADMIN_NOTIFY_EMAIL, subject: `Refund request: ${o.reference}`, body: `${s.email} asked for a refund on ${o.reference}: ${reason.slice(0, 500)}` });
  return { ok: 'Request sent. We\'ll review it and email you. For late or wrong food you can also phone the restaurant — their number is on this page.' };
}

/** Rebuilds a previous order against TODAY'S menu. Unavailable items are skipped and reported; prices are always re-read from the menu. */
export async function reorderAction(orderId: string): Promise<{ ok: true; restaurant: { id: string; slug: string; name: string }; lines: { itemId: string; name: string; qty: number; optionChoiceIds: string[]; optionLabels: string[]; unitPence: number; note?: string }[]; skipped: string[] } | { ok: false; error: string }> {
  const s = await requireSession('/orders');
  const db = await getDb();
  const o = await db.get<{ id: string; customer_id: string; restaurant_id: string; lines: { item_id: string; name: string; qty: number; options: { group: string; choice: string }[]; option_ids?: string[]; note?: string | null }[] }>('orders', { id: orderId });
  if (!o || o.customer_id !== s.userId) return { ok: false, error: 'Order not found' };
  const r = await db.get<{ id: string; slug: string; name: string; status: string; accepting_orders: boolean }>('restaurants', { id: o.restaurant_id });
  if (!r || r.status !== 'approved') return { ok: false, error: 'This restaurant is not taking orders right now.' };
  if (r.accepting_orders === false) return { ok: false, error: `${r.name} is offline right now.` };
  const items = await db.select<import('@/lib/types').MenuItem>('menu_items', { restaurant_id: r.id });
  const lines: { itemId: string; name: string; qty: number; optionChoiceIds: string[]; optionLabels: string[]; unitPence: number; note?: string }[] = [], skipped: string[] = [];
  for (const l of o.lines) {
    const it = items.find((i) => i.id === l.item_id);
    if (!it || !it.available) { skipped.push(l.name); continue; }
    const all = it.option_groups.flatMap((g) => g.choices);
    const ids = (l.option_ids?.length ? l.option_ids : l.options.map((x) => all.find((c) => c.name === x.choice)?.id).filter((x): x is string => !!x)).filter((id) => all.some((c) => c.id === id));
    try {
      const priced = priceLine(it, { itemId: it.id, qty: l.qty, optionChoiceIds: ids, note: l.note });
      lines.push({ itemId: it.id, name: it.name, qty: l.qty, optionChoiceIds: ids, optionLabels: priced.options.map((x) => x.choice), unitPence: priced.unit_price_pence, note: l.note ?? undefined });
    } catch { skipped.push(l.name); }
  }
  if (!lines.length) return { ok: false, error: 'None of the items from that order are available right now.' };
  return { ok: true, restaurant: { id: r.id, slug: r.slug, name: r.name }, lines, skipped };
}

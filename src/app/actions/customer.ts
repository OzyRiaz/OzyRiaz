'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getSession, requireSession } from '@/lib/auth/session';
import { demoPaymentsEnabled } from '@/lib/config';
import { getDb } from '@/lib/db';
import type { FormState } from '@/lib/form';
import { parsePostcode } from '@/lib/postcode';
import { cancelMembership, startMembershipCheckout } from '@/lib/services/membership';
import { createOrder, createPaymentSession, markOrderPaid, OrderError } from '@/lib/services/orders';
import { buildQuote, QuoteError, type Quote } from '@/lib/services/quote';
import type { Address, Profile } from '@/lib/types';
import { activateMembership } from '@/lib/services/membership';

const lineSchema = z.object({ itemId: z.string().min(1), qty: z.number().int().min(1).max(50), optionChoiceIds: z.array(z.string()).max(30), note: z.string().max(200).nullish() });
const quoteSchema = z.object({
  restaurantId: z.string().min(1), lines: z.array(lineSchema).min(1).max(60), fulfilment: z.enum(['delivery', 'collection']),
  postcode: z.string().max(10).nullish(), promoCode: z.string().max(40).nullish(),
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
    const order = await createOrder({ user: s, restaurantId: d.restaurantId, lines: d.lines, fulfilment: d.fulfilment, address, note: d.note, phone: d.phone, promoCode: d.promoCode || null, idempotencyKey: d.idempotencyKey });
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
  const s = await requireSession('/plus');
  const end = new Date(Date.now() + 30 * 864e5);
  await activateMembership(s.userId, { customerId: `cus_demo_${s.userId.slice(0, 6)}`, subscriptionId: `sub_demo_${s.userId.slice(0, 6)}`, periodEnd: end });
  const db = await getDb();
  await db.insert('transactions', { kind: 'membership_payment', order_id: null, user_id: s.userId, restaurant_id: null, amount_pence: 499, status: 'succeeded', stripe_ref: `in_demo_${Date.now()}`, note: 'Simulated demo payment' });
  redirect('/plus?status=success');
}

export async function joinMembershipAction() {
  const s = await requireSession('/plus');
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

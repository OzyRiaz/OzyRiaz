import { appUrl, demoPaymentsEnabled } from '../config';
import { getDb } from '../db';
import { getStripe } from '../stripe';
import type { Membership, Profile } from '../types';
import { getSettings } from './settings';
import { notify } from './notify';
import { fmt } from '../money';

export async function getMembership(userId: string) {
  return (await getDb()).get<Membership>('memberships', { user_id: userId });
}
export async function getActiveMembership(userId: string) {
  const m = await getMembership(userId);
  if (!m || m.status !== 'active') return null;
  if (m.current_period_end && new Date(m.current_period_end) < new Date()) return null;
  return m;
}

/** Membership money goes to the BD Feast PLATFORM Stripe account (no transfer_data, no Connect). */
export async function startMembershipCheckout(user: Profile): Promise<{ url: string }> {
  const db = await getDb();
  if (await getActiveMembership(user.id)) throw new Error('You already have an active BD Feast Plus membership');
  if (demoPaymentsEnabled()) {
    return { url: '/plus/demo' };
  }
  const stripe = getStripe();
  const settings = await getSettings();
  let m = await getMembership(user.id);
  let customerId = m?.stripe_customer_id ?? null;
  if (!customerId) {
    const c = await stripe.customers.create({ email: user.email, name: user.full_name, metadata: { user_id: user.id } }, { idempotencyKey: `customer-${user.id}` });
    customerId = c.id;
  }
  if (!m) m = await db.insert<Membership>('memberships', { user_id: user.id, status: 'incomplete', stripe_customer_id: customerId, stripe_subscription_id: null, current_period_end: null, cancel_at_period_end: false });
  else await db.update('memberships', { user_id: user.id }, { stripe_customer_id: customerId });
  const priceId = process.env.STRIPE_MEMBERSHIP_PRICE_ID;
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user.id,
    line_items: [priceId ? { price: priceId, quantity: 1 } : {
      quantity: 1,
      price_data: { currency: 'gbp', unit_amount: settings.membership_price_pence, recurring: { interval: 'month' }, product_data: { name: 'BD Feast Plus' } },
    }],
    subscription_data: { metadata: { user_id: user.id } },
    metadata: { kind: 'membership', user_id: user.id },
    success_url: `${appUrl()}/plus?status=success`,
    cancel_url: `${appUrl()}/plus?status=cancelled`,
  });
  return { url: session.url! };
}

export async function activateMembership(userId: string, p: { customerId?: string | null; subscriptionId?: string | null; periodEnd?: Date | null; notifyUser?: boolean }) {
  const db = await getDb();
  const existing = await getMembership(userId);
  const patch = {
    status: 'active', stripe_customer_id: p.customerId ?? existing?.stripe_customer_id ?? null,
    stripe_subscription_id: p.subscriptionId ?? existing?.stripe_subscription_id ?? null,
    current_period_end: (p.periodEnd ?? existing?.current_period_end ?? null) && new Date((p.periodEnd ?? existing?.current_period_end)!).toISOString(),
    cancel_at_period_end: false,
  };
  const wasActive = existing?.status === 'active';
  if (existing) await db.update('memberships', { user_id: userId }, patch);
  else await db.insert('memberships', { user_id: userId, ...patch });
  const user = await db.get<Profile>('profiles', { id: userId });
  if (user && !wasActive && p.notifyUser !== false) {
    const s = await getSettings();
    await notify({ kind: 'membership_confirmation', to: user.email, subject: 'Welcome to BD Feast Plus', body: `Hi ${user.full_name},\n\nYour BD Feast Plus membership (${fmt(s.membership_price_pence)}/month) is active. You can cancel any time from your account.\n\nBD Feast — Bradford at your table.` });
  }
}

export async function cancelMembership(userId: string) {
  const db = await getDb();
  const m = await getMembership(userId);
  if (!m || m.status !== 'active') throw new Error('No active membership to cancel');
  if (m.stripe_subscription_id && !m.stripe_subscription_id.startsWith('sub_demo')) {
    await getStripe().subscriptions.update(m.stripe_subscription_id, { cancel_at_period_end: true });
  }
  await db.update('memberships', { user_id: userId }, { cancel_at_period_end: true });
  const user = await db.get<Profile>('profiles', { id: userId });
  if (user) await notify({ kind: 'membership_cancellation', to: user.email, subject: 'Your BD Feast Plus cancellation', body: `Hi ${user.full_name},\n\nYour membership will end on ${m.current_period_end ? new Date(m.current_period_end).toLocaleDateString('en-GB') : 'the end of the current billing period'}. You keep your benefits until then and won't be charged again.\n\nBD Feast` });
}

export async function endMembership(userId: string) {
  const db = await getDb();
  const m = await getMembership(userId);
  if (!m) return;
  await db.update('memberships', { user_id: userId }, { status: 'cancelled', cancel_at_period_end: false });
}

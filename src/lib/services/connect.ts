import { appUrl, demoPaymentsEnabled, PAYMENTS_OFF_MESSAGE, stripeConfigured } from '../config';
import { getDb } from '../db';
import { getStripe } from '../stripe';
import type { Restaurant } from '../types';

/** Each restaurant gets its own Stripe Express connected account (UK). */
export async function startConnectOnboarding(r: Restaurant): Promise<{ url: string }> {
  const db = await getDb();
  if (demoPaymentsEnabled()) {
    await db.update('restaurants', { id: r.id }, { stripe_account_id: r.stripe_account_id ?? `acct_demo_${r.slug}`, stripe_details_submitted: true, stripe_charges_enabled: true, stripe_payouts_enabled: true });
    return { url: '/dashboard/payments?demo_onboarded=1' };
  }
  if (!stripeConfigured()) throw new Error(PAYMENTS_OFF_MESSAGE);
  const stripe = getStripe();
  let acct = r.stripe_account_id;
  if (!acct) {
    const a = await stripe.accounts.create({
      type: 'express', country: 'GB', email: r.email ?? undefined,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { name: r.name, mcc: '5812' },
      metadata: { restaurant_id: r.id },
    }, { idempotencyKey: `acct-${r.id}` });
    acct = a.id;
    await db.update('restaurants', { id: r.id }, { stripe_account_id: acct });
  }
  const link = await stripe.accountLinks.create({
    account: acct, type: 'account_onboarding',
    refresh_url: `${appUrl()}/dashboard/payments?refresh=1`, return_url: `${appUrl()}/dashboard/payments?returned=1`,
  });
  return { url: link.url };
}

export async function refreshConnectStatus(r: Restaurant): Promise<Restaurant> {
  if (!r.stripe_account_id || demoPaymentsEnabled()) return r;
  const a = await getStripe().accounts.retrieve(r.stripe_account_id);
  const [u] = await (await getDb()).update<Restaurant>('restaurants', { id: r.id }, { stripe_details_submitted: a.details_submitted, stripe_charges_enabled: a.charges_enabled, stripe_payouts_enabled: a.payouts_enabled });
  return u ?? r;
}

export async function connectDashboardLink(r: Restaurant): Promise<string | null> {
  if (!r.stripe_account_id || demoPaymentsEnabled()) return null;
  return (await getStripe().accounts.createLoginLink(r.stripe_account_id)).url;
}

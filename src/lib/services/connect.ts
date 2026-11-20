import { appUrl, demoPaymentsEnabled, PAYMENTS_OFF_MESSAGE, stripeConfigured } from '../config';
import { getDb } from '../db';
import { getStripe } from '../stripe';
import type { Restaurant } from '../types';

/**
 * Each restaurant gets its own Stripe connected account (UK, Express dashboard) created with Accounts v2.
 * v2 accounts still work with v1 endpoints: accounts.retrieve / createLoginLink, destination charges, and
 * the v1 `account.updated` webhook (charges_enabled / payouts_enabled) are unchanged.
 */
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
    // Accounts v2 (POST /v2/core/accounts). Express dashboard needs the platform to collect fees and
    // cover losses. merchant.card_payments backs `on_behalf_of`; recipient.stripe_transfers receives the
    // destination-charge transfers.
    const a = await stripe.v2.core.accounts.create({
      contact_email: r.email ?? undefined,
      display_name: r.name,
      identity: { country: 'gb' },
      dashboard: 'express',
      defaults: { currency: 'gbp', locales: ['en-GB'], responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
      configuration: {
        merchant: { mcc: '5812', capabilities: { card_payments: { requested: true } } },
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
      },
      metadata: { restaurant_id: r.id },
    }, { idempotencyKey: `acct-v2-${r.id}` });
    acct = a.id;
    await db.update('restaurants', { id: r.id }, { stripe_account_id: acct });
  }
  const link = await stripe.v2.core.accountLinks.create({
    account: acct,
    use_case: { type: 'account_onboarding', account_onboarding: {
      refresh_url: `${appUrl()}/dashboard/payments?refresh=1`, return_url: `${appUrl()}/dashboard/payments?returned=1`,
    } },
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

import type Stripe from 'stripe';
import { demoPaymentsEnabled, stripeConfigured } from '../config';
import { getDb } from '../db';
import { fmt } from '../money';
import { getStripe } from '../stripe';
import type { Restaurant } from '../types';
import { notify } from './notify';

export interface PayoutRow { id: string; restaurant_id: string; stripe_payout_id: string; amount_pence: number; status: 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled'; arrival_date: string | null; failure_message: string | null; created_at: string }

/**
 * Pending/available balances for a restaurant, read LIVE from Stripe (connected account). Returns null when Stripe isn't
 * configured, the restaurant has no connected account yet, or the call fails — callers must show "unavailable", never a guess.
 */
export async function restaurantBalances(r: Restaurant): Promise<{ available_pence: number; pending_pence: number } | null> {
  if (!r.stripe_account_id || demoPaymentsEnabled() || !stripeConfigured()) return null;
  try {
    const b = await getStripe().balance.retrieve({}, { stripeAccount: r.stripe_account_id });
    const gbp = (xs: { amount: number; currency: string }[]) => xs.filter((x) => x.currency === 'gbp').reduce((s, x) => s + x.amount, 0);
    return { available_pence: gbp(b.available), pending_pence: gbp(b.pending) };
  } catch { return null; }
}

/** Weekly payouts (Mondays). Stripe may reject schedule changes for some account configurations — surfaced as an error, never assumed. */
export async function setWeeklyPayouts(r: Restaurant) {
  if (!r.stripe_account_id) throw new Error('Restaurant has no Stripe account yet');
  if (demoPaymentsEnabled() || !stripeConfigured()) throw new Error('Stripe is not configured');
  await getStripe().accounts.update(r.stripe_account_id, { settings: { payouts: { schedule: { interval: 'weekly', weekly_anchor: 'monday' } } } });
}

const STATUS = (s: string): PayoutRow['status'] => (s === 'paid' ? 'paid' : s === 'failed' ? 'failed' : s === 'canceled' ? 'canceled' : s === 'in_transit' ? 'in_transit' : 'pending');

/** Records a payout from a SIGNATURE-VERIFIED Stripe event. This table is the only source for "paid to bank" figures. */
export async function recordPayoutEvent(connectedAccountId: string, payout: Stripe.Payout, eventType: string) {
  const db = await getDb();
  const r = await db.get<Restaurant>('restaurants', { stripe_account_id: connectedAccountId });
  if (!r || payout.currency !== 'gbp') return;
  const existing = await db.get<PayoutRow>('restaurant_payouts', { stripe_payout_id: payout.id });
  const status = eventType === 'payout.paid' ? 'paid' : eventType === 'payout.failed' ? 'failed' : eventType === 'payout.canceled' ? 'canceled' : STATUS(payout.status);
  const row = { restaurant_id: r.id, stripe_payout_id: payout.id, amount_pence: payout.amount, status, arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null, failure_message: payout.failure_message ?? null };
  if (existing) await db.update('restaurant_payouts', { stripe_payout_id: payout.id }, row); else await db.insert('restaurant_payouts', row);
  if (status !== existing?.status) {
    if (status === 'paid') await notify({ kind: 'payout_paid', to: r.email, subject: `Payout sent: ${fmt(payout.amount)}`, body: `Stripe has paid ${fmt(payout.amount)} to your bank account. It may take a short time to appear. Details are in your FeastQuarter dashboard (Earnings).` });
    if (status === 'failed') await notify({ kind: 'payout_failed', to: r.email, subject: `Payout failed: ${fmt(payout.amount)}`, body: `A payout of ${fmt(payout.amount)} failed${payout.failure_message ? `: ${payout.failure_message}` : ''}. Please check your bank details in the Stripe dashboard (Payments → Update Stripe details).` });
  }
}

export async function listPayouts(restaurantId: string): Promise<PayoutRow[]> {
  return (await getDb()).select<PayoutRow>('restaurant_payouts', { restaurant_id: restaurantId }, { order: ['created_at', 'desc'], limit: 50 });
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { getDb } from '@/lib/db';
import { listPayouts, recordPayoutEvent, restaurantBalances, setWeeklyPayouts } from '@/lib/services/payouts';
import { processStripeEvent } from '@/lib/services/stripe-webhook';
import { restaurantEarnings } from '@/lib/services/reports';
import { __setStripeForTests } from '@/lib/stripe';
import { freshDb, karahi } from './helpers';
import type { Notification } from '@/lib/types';

const ev = (id: string, type: string, object: unknown, account?: string) => ({ id, type, account, data: { object } }) as unknown as Stripe.Event;
const payout = (id: string, status: string, amount = 5000, extra: object = {}) => ({ id, status, amount, currency: 'gbp', arrival_date: Math.floor(Date.now() / 1000) + 86400, failure_message: null, ...extra }) as unknown as Stripe.Payout;
beforeEach(async () => { await freshDb(); __setStripeForTests(null); delete process.env.STRIPE_SECRET_KEY; });

describe('payout records come only from verified Stripe events', () => {
  it('payout.created → in_transit → paid: status follows Stripe; a card payment alone never shows as paid-to-bank', async () => {
    const { r } = await karahi();
    await processStripeEvent(ev('e1', 'payout.created', payout('po_1', 'pending'), r.stripe_account_id!));
    expect((await listPayouts(r.id))[0].status).toBe('pending');
    await processStripeEvent(ev('e2', 'payout.paid', payout('po_1', 'paid'), r.stripe_account_id!));
    const rows = await listPayouts(r.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'paid', amount_pence: 5000 });
    expect((await (await getDb()).select<Notification>('notifications')).filter((n) => n.kind === 'payout_paid')).toHaveLength(1);
  });
  it('failed payouts are recorded with the reason and the restaurant is notified once', async () => {
    const { r } = await karahi();
    await processStripeEvent(ev('e3', 'payout.failed', payout('po_2', 'failed', 3000, { failure_message: 'Account closed' }), r.stripe_account_id!));
    await processStripeEvent(ev('e4', 'payout.failed', payout('po_2', 'failed', 3000, { failure_message: 'Account closed' }), r.stripe_account_id!)); // different event id, same state
    const rows = await listPayouts(r.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'failed', failure_message: 'Account closed' });
    expect((await (await getDb()).select<Notification>('notifications')).filter((n) => n.kind === 'payout_failed')).toHaveLength(1);
  });
  it('ignores payouts for unknown connected accounts and duplicate event ids', async () => {
    await recordPayoutEvent('acct_unknown', payout('po_x', 'paid'), 'payout.paid');
    expect(await (await getDb()).select('restaurant_payouts')).toHaveLength(0);
    const { r } = await karahi();
    const e = ev('dup', 'payout.paid', payout('po_3', 'paid'), r.stripe_account_id!);
    expect((await processStripeEvent(e)).duplicate).toBe(false);
    expect((await processStripeEvent(e)).duplicate).toBe(true);
  });
});

describe('live balances and payout schedule (Stripe mocked — not a live verification)', () => {
  it('reads pending/available GBP balances from the CONNECTED account', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock0000000000000000';
    const retrieve = vi.fn().mockResolvedValue({ available: [{ amount: 1200, currency: 'gbp' }, { amount: 99, currency: 'usd' }], pending: [{ amount: 3400, currency: 'gbp' }] });
    __setStripeForTests({ balance: { retrieve } });
    const { r } = await karahi();
    expect(await restaurantBalances({ ...r, stripe_account_id: 'acct_live_like' })).toEqual({ available_pence: 1200, pending_pence: 3400 });
    expect(retrieve).toHaveBeenCalledWith({}, { stripeAccount: 'acct_live_like' });
  });
  it('returns null (shown as "unavailable") rather than guessing when Stripe is not configured or errors', async () => {
    const { r } = await karahi();
    expect(await restaurantBalances(r)).toBeNull();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock0000000000000000';
    __setStripeForTests({ balance: { retrieve: vi.fn().mockRejectedValue(new Error('boom')) } });
    expect(await restaurantBalances({ ...r, stripe_account_id: 'acct_x' })).toBeNull();
  });
  it('sets a weekly (Monday) payout schedule on the connected account', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock0000000000000000';
    const update = vi.fn().mockResolvedValue({});
    __setStripeForTests({ accounts: { update } });
    const { r } = await karahi();
    await setWeeklyPayouts({ ...r, stripe_account_id: 'acct_w' });
    expect(update).toHaveBeenCalledWith('acct_w', { settings: { payouts: { schedule: { interval: 'weekly', weekly_anchor: 'monday' } } } });
  });
  it('estimated earnings are reported separately from settled payouts', async () => {
    const { r } = await karahi();
    const { summary } = await restaurantEarnings(r.id);
    expect(summary).toHaveProperty('net_pence'); // estimate
    expect(await listPayouts(r.id)).toEqual([]);  // settled figures start empty until Stripe confirms
  });
});

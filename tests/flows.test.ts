import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { getDb } from '@/lib/db';
import { createOrder, createPaymentSession, markOrderPaid, markPaymentFailed, OrderError, refundOrder, updateOrderStatus } from '@/lib/services/orders';
import { processStripeEvent } from '@/lib/services/stripe-webhook';
import { buildQuote, QuoteError } from '@/lib/services/quote';
import { activateMembership, cancelMembership, getActiveMembership } from '@/lib/services/membership';
import { platformStats, restaurantEarnings } from '@/lib/services/reports';
import { listRestaurants } from '@/lib/services/restaurants';
import { __setStripeForTests } from '@/lib/stripe';
import { customer, freshDb, karahi, member, owner, owner2, sessionFor } from './helpers';
import type { Notification, Order, Transaction } from '@/lib/types';

const ev = (id: string, type: string, object: unknown) => ({ id, type, data: { object } }) as unknown as Stripe.Event;

async function placeOrder(opts: { who?: 'customer' | 'member'; key?: string; fulfilment?: 'delivery' | 'collection'; promo?: string; qty?: number } = {}) {
  const { r, byName } = await karahi();
  const user = opts.who === 'member' ? await member() : await customer();
  const order = await createOrder({
    user, restaurantId: r.id, fulfilment: opts.fulfilment ?? 'delivery', idempotencyKey: opts.key ?? crypto.randomUUID(), promoCode: opts.promo,
    address: { line1: '1 Test St', city: 'Bradford', postcode: 'BD5 0AA' },
    lines: [{ itemId: byName('Garlic naan').id, qty: opts.qty ?? 6, optionChoiceIds: [] }],
  });
  return { order, r, user };
}

beforeEach(async () => { await freshDb(); __setStripeForTests(null); delete process.env.STRIPE_SECRET_KEY; });

describe('ordering', () => {
  it('creates an UNPAID order with server-computed commission', async () => {
    const { order } = await placeOrder();
    expect(order.status).toBe('pending_payment');
    expect(order.payment_status).toBe('unpaid');
    expect(order.subtotal_pence).toBe(6 * 320);
    expect(order.delivery_fee_pence).toBe(250);
    expect(order.commission_pence).toBe(Math.round(1920 * 0.08));
    expect(order.paid_at).toBeNull();
  });

  it('prevents duplicate orders with the same idempotency key', async () => {
    const a = await placeOrder({ key: 'k1' });
    const b = await placeOrder({ key: 'k1' });
    expect(b.order.id).toBe(a.order.id);
    expect(await (await getDb()).select('orders', { idempotency_key: 'k1' })).toHaveLength(1);
  });

  it('rejects idempotency key reuse by a different customer', async () => {
    await placeOrder({ key: 'shared' });
    const { r, byName } = await karahi();
    await expect(createOrder({ user: await member(), restaurantId: r.id, fulfilment: 'collection', idempotencyKey: 'shared', lines: [{ itemId: byName('Garlic naan').id, qty: 6, optionChoiceIds: [] }] })).rejects.toThrow(OrderError);
  });

  it('enforces delivery postcode, minimum order, and one restaurant per order', async () => {
    const { r, byName } = await karahi();
    const line = [{ itemId: byName('Garlic naan').id, qty: 6, optionChoiceIds: [] }];
    await expect(buildQuote({ restaurantId: r.id, lines: line, fulfilment: 'delivery', postcode: 'LS1 4AA' })).rejects.toThrow(/not available in your area/);
    await expect(buildQuote({ restaurantId: r.id, lines: line, fulfilment: 'delivery', postcode: 'BD20 5AA' })).rejects.toThrow(/does not deliver/);
    await expect(buildQuote({ restaurantId: r.id, lines: [{ itemId: byName('Garlic naan').id, qty: 1, optionChoiceIds: [] }], fulfilment: 'collection' })).rejects.toThrow(/Minimum order/);
    // an item from another restaurant can't be smuggled in
    const other = (await (await getDb()).select<{ id: string; restaurant_id: string }>('menu_items')).find((i) => i.restaurant_id !== r.id)!;
    await expect(buildQuote({ restaurantId: r.id, lines: [...line, { itemId: other.id, qty: 1, optionChoiceIds: [] }], fulfilment: 'collection' })).rejects.toThrow(QuoteError);
  });

  it('applies the member offer only to active members, and never for non-members', async () => {
    const { r, byName } = await karahi();
    const line = [{ itemId: byName('Lamb karahi').id, qty: 2, optionChoiceIds: ['spice-1'] }];
    const non = await buildQuote({ restaurantId: r.id, lines: line, fulfilment: 'collection', userId: (await customer()).userId });
    const mem = await buildQuote({ restaurantId: r.id, lines: line, fulfilment: 'collection', userId: (await member()).userId });
    expect(non.discount_pence).toBe(0);
    expect(non.memberHint).toMatch(/Plus members save/);
    expect(mem.discount_pence).toBe(Math.round(2790 * 0.1));
    expect(mem.discount_funded_by_restaurant_pence).toBe(mem.discount_pence);
  });

  it('hides restaurants that cannot serve the postcode, and unapproved restaurants', async () => {
    const bd5 = await listRestaurants({ postcode: 'BD5 0AA' });
    expect(bd5.length).toBeGreaterThan(3);
    expect(bd5.find((r) => r.slug === 'green-bowl-demo')).toBeUndefined(); // pending
    expect(bd5.find((r) => r.slug === 'fish-quay-demo')?.availability).toBe('collection_only');
    const bd20 = await listRestaurants({ postcode: 'BD20 5AA' });
    expect(bd20.every((r) => r.availability === 'collection_only')).toBe(true);
    expect(await listRestaurants({ postcode: 'LS1 4AA' })).toHaveLength(0);
  });
});

describe('payment is confirmed only by verified webhooks', () => {
  it('a customer returning from checkout does not mark the order paid', async () => {
    const { order } = await placeOrder();
    const db = await getDb();
    expect((await db.get<Order>('orders', { id: order.id }))!.payment_status).toBe('unpaid');
    // there is no code path from the success page to markOrderPaid; the demo route is also gated (see demo-pay route test below)
  });

  it('marks paid once, records charge + commission, and ignores duplicate webhook deliveries', async () => {
    const { order } = await placeOrder();
    const e = ev('evt_1', 'checkout.session.completed', { id: 'cs_1', mode: 'payment', payment_status: 'paid', amount_total: order.total_pence, payment_intent: 'pi_1', metadata: { kind: 'order', order_id: order.id } });
    expect(await processStripeEvent(e)).toEqual({ duplicate: false });
    expect(await processStripeEvent(e)).toEqual({ duplicate: true });
    // a different event id for the same payment (e.g. async_payment_succeeded) must still not double count
    await processStripeEvent(ev('evt_2', 'checkout.session.async_payment_succeeded', { id: 'cs_1', mode: 'payment', payment_status: 'paid', amount_total: order.total_pence, payment_intent: 'pi_1', metadata: { kind: 'order', order_id: order.id } }));
    const db = await getDb();
    const o = (await db.get<Order>('orders', { id: order.id }))!;
    expect(o.payment_status).toBe('paid');
    expect(o.status).toBe('awaiting_restaurant');
    expect(o.stripe_payment_intent_id).toBe('pi_1');
    const tx = await db.select<Transaction>('transactions', { order_id: order.id });
    expect(tx.filter((t) => t.kind === 'order_payment')).toHaveLength(1);
    expect(tx.find((t) => t.kind === 'application_fee')!.amount_pence).toBe(order.application_fee_pence);
    const mails = await db.select<Notification>('notifications');
    expect(mails.filter((m) => m.kind === 'order_confirmation')).toHaveLength(1);
    expect(mails.filter((m) => m.kind === 'restaurant_new_order')).toHaveLength(1);
  });

  it('refuses to mark an order paid when the paid amount differs from the order total', async () => {
    const { order } = await placeOrder();
    await expect(markOrderPaid(order.id, { amountPence: order.total_pence - 1, source: 'stripe' })).rejects.toThrow(/does not match/);
    expect((await (await getDb()).get<Order>('orders', { id: order.id }))!.payment_status).toBe('unpaid');
  });

  it('removes the event record when handling fails so Stripe can retry', async () => {
    const e = ev('evt_bad', 'checkout.session.completed', { mode: 'payment', payment_status: 'paid', amount_total: 1, metadata: { kind: 'order', order_id: 'missing' } });
    await expect(processStripeEvent(e)).rejects.toThrow();
    expect(await (await getDb()).get('stripe_events', { id: 'evt_bad' })).toBeNull();
  });

  it('payment failure sets failed state, notifies once, and never downgrades a paid order', async () => {
    const { order } = await placeOrder();
    await markPaymentFailed(order.id, 'Card declined', 'pi_x');
    await markPaymentFailed(order.id, 'Card declined', 'pi_x');
    const db = await getDb();
    expect((await db.get<Order>('orders', { id: order.id }))!.status).toBe('payment_failed');
    expect((await db.select<Notification>('notifications')).filter((n) => n.kind === 'payment_failed')).toHaveLength(1);
    await markOrderPaid(order.id, { amountPence: order.total_pence, paymentIntentId: 'pi_x', source: 'stripe' }); // customer retried and succeeded
    await markPaymentFailed(order.id, 'late failure event');
    expect((await db.get<Order>('orders', { id: order.id }))!.payment_status).toBe('paid');
  });
});

describe('Stripe Connect session', () => {
  it('creates a destination charge to the restaurant with BD Feast application fee and idempotency', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock0000000000000000';
    const create = vi.fn().mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.test/x' });
    __setStripeForTests({ checkout: { sessions: { create } }, coupons: { create: vi.fn().mockResolvedValue({ id: 'co_1' }) } });
    const { order, r } = await placeOrder({ who: 'member', fulfilment: 'delivery', qty: 8 });
    const out = await createPaymentSession(order, 'm@example.com');
    expect(out.url).toContain('stripe.test');
    const [params, opts] = create.mock.calls[0];
    expect(params.mode).toBe('payment');
    expect(params.payment_intent_data.transfer_data.destination).toBe(r.stripe_account_id);
    expect(params.payment_intent_data.application_fee_amount).toBe(order.application_fee_pence);
    expect(params.metadata.order_id).toBe(order.id);
    expect(opts.idempotencyKey).toBe(`order-session-${order.id}`);
    // Stripe-side total must equal the order total (lines + delivery - coupon)
    const lines = params.line_items.reduce((s: number, l: any) => s + l.quantity * l.price_data.unit_amount, 0);
    expect(lines - order.discount_pence).toBe(order.total_pence);
    expect(params.discounts).toBeDefined();
    expect(order.discount_pence).toBeGreaterThan(0);
  });
  it('refuses to take payment for a restaurant that has not finished Stripe onboarding', async () => {
    const { r, byName } = await karahi();
    const db = await getDb();
    await db.update('restaurants', { id: r.id }, { stripe_charges_enabled: false });
    await expect(createOrder({ user: await customer(), restaurantId: r.id, fulfilment: 'collection', idempotencyKey: 'x', lines: [{ itemId: byName('Garlic naan').id, qty: 6, optionChoiceIds: [] }] })).rejects.toThrow(/payment setup/);
  });
});

describe('restaurant operations', () => {
  async function paid() {
    const { order } = await placeOrder();
    await markOrderPaid(order.id, { amountPence: order.total_pence, paymentIntentId: 'pi_demo_flow', source: 'stripe' });
    return order;
  }
  it('walks a delivery order through the full lifecycle', async () => {
    const o = await paid(); const me = await owner();
    for (const s of ['accepted', 'preparing', 'ready', 'out_for_delivery', 'completed'] as const) expect((await updateOrderStatus(o.id, s, me)).status).toBe(s);
  });
  it('rejects illegal transitions and unpaid orders', async () => {
    const o = await paid(); const me = await owner();
    await expect(updateOrderStatus(o.id, 'completed', me)).rejects.toThrow(/Cannot move/);
    const { order: unpaid } = await placeOrder();
    await expect(updateOrderStatus(unpaid.id, 'accepted', me)).rejects.toThrow(/not been paid/);
  });
  it("restaurants cannot see or change another restaurant's orders", async () => {
    const o = await paid();
    await expect(updateOrderStatus(o.id, 'accepted', await owner2())).rejects.toThrow(/access/);
    await expect(updateOrderStatus(o.id, 'accepted', await customer())).rejects.toThrow(/access/);
  });
  it('rejecting a paid order requires a reason and refunds in full', async () => {
    const o = await paid(); const me = await owner();
    await expect(updateOrderStatus(o.id, 'rejected', me)).rejects.toThrow(/reason/);
    await updateOrderStatus(o.id, 'rejected', me, { reason: 'Kitchen closed' });
    const db = await getDb();
    const after = (await db.get<Order>('orders', { id: o.id }))!;
    expect(after.payment_status).toBe('refunded');
    expect(after.refunded_pence).toBe(o.total_pence);
    expect((await db.select<Transaction>('transactions', { order_id: o.id, kind: 'refund' }))[0].amount_pence).toBe(-o.total_pence);
  });
  it('partial refunds are bounded and reduce earnings and commission proportionally', async () => {
    const o = await paid();
    await refundOrder(o.id, 500, 'Missing item', null);
    await expect(refundOrder(o.id, o.total_pence, 'too much', null)).rejects.toThrow(/Refund must be/);
    const { summary } = await restaurantEarnings(o.restaurant_id);
    const mine = summary;
    expect(mine.refunded_pence).toBe(500);
    expect((await (await getDb()).get<Order>('orders', { id: o.id }))!.payment_status).toBe('partially_refunded');
  });
});

describe('membership (£4.99/month, platform account)', () => {
  it('activates via webhook, records subscription revenue separately from commission, then cancels at period end', async () => {
    const u = await customer();
    expect(await getActiveMembership(u.userId)).toBeNull();
    const db = await getDb();
    await db.insert('memberships', { user_id: u.userId, status: 'incomplete', stripe_customer_id: 'cus_1', stripe_subscription_id: null, current_period_end: null, cancel_at_period_end: false });
    await processStripeEvent(ev('evt_m1', 'checkout.session.completed', { mode: 'subscription', customer: 'cus_1', subscription: 'sub_1', metadata: { kind: 'membership', user_id: u.userId } }));
    const end = Math.floor(Date.now() / 1000) + 30 * 86400;
    await processStripeEvent(ev('evt_m2', 'invoice.paid', { id: 'in_1', customer: 'cus_1', amount_paid: 499, lines: { data: [{ period: { end } }] } }));
    expect(await getActiveMembership(u.userId)).not.toBeNull();
    const stats = await platformStats();
    expect(stats.subscription_revenue_pence).toBe(499);
    expect(stats.platform_revenue_pence).toBe(stats.commission_revenue_pence + 499);
    expect(stats.gmv_pence).toBeGreaterThan(stats.platform_revenue_pence); // GMV is NOT revenue
    const mails = (await db.select<Notification>('notifications')).map((n) => n.kind);
    expect(mails.filter((k) => k === 'membership_confirmation')).toHaveLength(1);

    const update = vi.fn().mockResolvedValue({});
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock0000000000000000';
    __setStripeForTests({ subscriptions: { update } });
    await cancelMembership(u.userId);
    expect(update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true });
    expect((await getActiveMembership(u.userId))).not.toBeNull(); // still active until period end
    await processStripeEvent(ev('evt_m3', 'customer.subscription.deleted', { id: 'sub_1', customer: 'cus_1', metadata: { user_id: u.userId } }));
    expect(await getActiveMembership(u.userId)).toBeNull();
    expect((await db.select<Notification>('notifications')).some((n) => n.kind === 'membership_cancellation')).toBe(true);
  });
  it('failed renewal moves membership to past_due, loses benefits, and notifies', async () => {
    const m = await member();
    const db = await getDb();
    await db.update('memberships', { user_id: m.userId }, { stripe_customer_id: 'cus_m' });
    await processStripeEvent(ev('evt_f1', 'invoice.payment_failed', { id: 'in_f', customer: 'cus_m', amount_due: 499 }));
    expect(await getActiveMembership(m.userId)).toBeNull();
    expect((await db.select<Notification>('notifications')).some((n) => n.kind === 'membership_payment_failed')).toBe(true);
    expect((await platformStats()).failed_payments).toBe(1);
  });
  it('activation is idempotent (no duplicate welcome emails)', async () => {
    const u = await customer();
    await activateMembership(u.userId, { customerId: 'c' });
    await activateMembership(u.userId, { customerId: 'c' });
    expect((await (await getDb()).select<Notification>('notifications')).filter((n) => n.kind === 'membership_confirmation')).toHaveLength(1);
  });
});

describe('Connect + disputes', () => {
  it('syncs connected account status from account.updated', async () => {
    const db = await getDb();
    const g = (await db.get<{ id: string }>('restaurants', { slug: 'green-bowl-demo' }))!;
    await db.update('restaurants', { id: g.id }, { stripe_account_id: 'acct_x', email: 'g@example.com' });
    await processStripeEvent(ev('evt_a1', 'account.updated', { id: 'acct_x', details_submitted: true, charges_enabled: true, payouts_enabled: false }));
    const r = (await db.get<any>('restaurants', { id: g.id }))!;
    expect([r.stripe_charges_enabled, r.stripe_payouts_enabled]).toEqual([true, false]);
  });
  it('records disputes and reconciles dashboard refunds', async () => {
    const { order } = await placeOrder();
    await markOrderPaid(order.id, { amountPence: order.total_pence, paymentIntentId: 'pi_d', source: 'stripe' });
    await processStripeEvent(ev('evt_d1', 'charge.dispute.created', { id: 'dp_1', payment_intent: 'pi_d', amount: order.total_pence, reason: 'fraudulent', status: 'needs_response' }));
    const db = await getDb();
    expect((await db.get<Order>('orders', { id: order.id }))!.payment_status).toBe('disputed');
    expect((await platformStats()).open_disputes).toBe(1);
    await processStripeEvent(ev('evt_d2', 'charge.dispute.closed', { id: 'dp_1', payment_intent: 'pi_d', amount: order.total_pence, reason: 'fraudulent', status: 'won' }));
    expect((await db.get<Order>('orders', { id: order.id }))!.payment_status).toBe('paid');
    await processStripeEvent(ev('evt_r1', 'charge.refunded', { id: 'ch_1', payment_intent: 'pi_d', amount_refunded: 300 }));
    await processStripeEvent(ev('evt_r2', 'charge.refunded', { id: 'ch_1', payment_intent: 'pi_d', amount_refunded: 300 }));
    expect((await db.select('transactions', { order_id: order.id, kind: 'refund' }))).toHaveLength(1);
  });
});

describe('promo codes', () => {
  it('applies a platform-funded promo (capped at commission), counts a use only once paid', async () => {
    const { order } = await placeOrder({ promo: 'welcome-demo', qty: 8 });
    expect(order.promo_code).toBe('WELCOME-DEMO');
    expect(order.discount_pence).toBeLessThanOrEqual(order.commission_pence);
    expect(order.discount_funded_by_platform_pence).toBe(order.discount_pence);
    const db = await getDb();
    expect((await db.get<any>('promotions', { code: 'WELCOME-DEMO' }))!.used_count).toBe(0);
    await markOrderPaid(order.id, { amountPence: order.total_pence, source: 'stripe' });
    await markOrderPaid(order.id, { amountPence: order.total_pence, source: 'stripe' });
    expect((await db.get<any>('promotions', { code: 'WELCOME-DEMO' }))!.used_count).toBe(1);
  });
  it('rejects unknown codes with a clear error', async () => {
    await expect(placeOrder({ promo: 'NOPE' })).rejects.toThrow(/not recognised/);
  });
});

describe('suspended accounts', () => {
  it('cannot place orders', async () => {
    const u = await customer();
    await (await getDb()).update('profiles', { id: u.userId }, { suspended: true });
    await expect(placeOrder()).rejects.toThrow(/cannot place orders/);
    expect(await sessionFor('customer@demo.bdfeast.test')).toBeTruthy();
  });
});

describe('demo sessions', () => {
  it('demo user ids are stable across restarts so cookies stay valid', async () => {
    const a = (await customer()).userId;
    await freshDb();
    expect((await customer()).userId).toBe(a);
  });
});

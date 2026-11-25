import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/lib/db';
import { DEMO_ACCOUNTS } from '@/lib/demo-data';
import { allocateRefund } from '@/lib/refunds';
import { cancelOrderByCustomer, createOrder, createPaymentSession, markOrderPaid, reconcileRefund, refundOrder, updateOrderStatus } from '@/lib/services/orders';
import { processUnansweredOrders } from '@/lib/services/operations';
import { breakdown, restaurantEarnings, revenueReport } from '@/lib/services/reports';
import { applySettingsChange, getSettings, SettingsError } from '@/lib/services/settings';
import { vatStatus } from '@/lib/services/vat';
import { __setStripeForTests } from '@/lib/stripe';
import type { Order, OrderRefund } from '@/lib/types';
import { customer, freshDb, karahi, owner, sessionFor } from './helpers';

async function place(fulfilment: 'delivery' | 'collection' = 'delivery', qty = 6, key = crypto.randomUUID()) {
  const { r, byName } = await karahi();
  return createOrder({ user: await customer(), restaurantId: r.id, fulfilment, idempotencyKey: key, address: { line1: '1 Test St', city: 'Bradford', postcode: 'BD5 0AA' }, lines: [{ itemId: byName('Garlic naan').id, qty, optionChoiceIds: [] }] });
}
async function paid(fulfilment: 'delivery' | 'collection' = 'delivery', qty = 6, pi = 'pi_demo_sf') {
  const o = await place(fulfilment, qty);
  await markOrderPaid(o.id, { amountPence: o.total_pence, paymentIntentId: pi, source: 'stripe' });
  return (await (await getDb()).get<Order>('orders', { id: o.id }))!;
}
const reload = async (id: string) => (await (await getDb()).get<Order>('orders', { id }))!;
beforeEach(async () => { await freshDb(); __setStripeForTests(null); delete process.env.STRIPE_SECRET_KEY; });

describe('99p service fee on orders', () => {
  it('is stored on delivery AND collection orders along with the 10% rate', async () => {
    for (const f of ['delivery', 'collection'] as const) {
      const o = await place(f);
      expect(o.service_fee_pence).toBe(99);
      expect(o.commission_bps).toBe(1000);
      expect(o.total_pence).toBe(o.subtotal_pence + o.delivery_fee_pence + 99);
      expect(o.application_fee_pence).toBe(o.commission_pence + 99);
      expect(o.restaurant_net_pence).toBe(o.subtotal_pence + o.delivery_fee_pence - o.commission_pence); // restaurant never receives the 99p
    }
  });

  it('goes to Stripe as one visible line item and inside ONE application fee; the session is idempotent per order (no double-adding)', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock0000000000000000';
    const create = vi.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.test/x' });
    __setStripeForTests({ checkout: { sessions: { create } } });
    const o = await place('collection');
    await createPaymentSession(o, 'c@example.com');
    await createPaymentSession(o, 'c@example.com'); // retry
    const [p1, opt1] = create.mock.calls[0], [, opt2] = create.mock.calls[1];
    expect(opt1.idempotencyKey).toBe(opt2.idempotencyKey);
    expect(p1.line_items.filter((l: any) => /service fee/i.test(l.price_data.product_data.name))).toHaveLength(1);
    expect(p1.line_items.reduce((s: number, l: any) => s + l.quantity * l.price_data.unit_amount, 0)).toBe(o.total_pence);
    expect(p1.payment_intent_data.application_fee_amount).toBe(o.commission_pence + 99);
    expect(p1.payment_intent_data.transfer_data.destination).toBeTruthy(); // 99p stays in the application fee, never transferred
  });

  it('retrying the same checkout submit returns the same order (no second fee)', async () => {
    const a = await place('delivery', 6, 'same-key'), b = await place('delivery', 6, 'same-key');
    expect(b.id).toBe(a.id);
    expect(b.total_pence).toBe(a.total_pence);
  });

  it('a fee change applies to NEW orders only; historical orders keep their fee and rate', async () => {
    const before = await paid();
    const admin = await sessionFor(DEMO_ACCOUNTS.admin);
    await applySettingsChange(admin.userId, { customer_service_fee_pence: 129 }, 'test change');
    expect((await reload(before.id)).service_fee_pence).toBe(99);
    expect((await place()).service_fee_pence).toBe(129);
  });

  it('service fee changes are admin-validated and audited (who/old/new/why)', async () => {
    const admin = await sessionFor(DEMO_ACCOUNTS.admin);
    await expect(applySettingsChange(admin.userId, { customer_service_fee_pence: 99.5 }, 'x y z')).rejects.toThrow(SettingsError);
    await expect(applySettingsChange(admin.userId, { customer_service_fee_pence: 10000 }, 'x y z')).rejects.toThrow(SettingsError);
    await expect(applySettingsChange(admin.userId, { customer_service_fee_pence: 100 }, '')).rejects.toThrow(/reason/);
    await applySettingsChange(admin.userId, { customer_service_fee_pence: 100 }, 'Board decision');
    expect((await getSettings()).customer_service_fee_pence).toBe(100);
    const log = await (await getDb()).select<any>('settings_audit', { field: 'customer_service_fee_pence' });
    expect(log[0]).toMatchObject({ changed_by: admin.userId, old_value: '99', new_value: '100', reason: 'Board decision' });
  });

  it('Plus (flag off by default) never waives the 99p, even when a member is switched on', async () => {
    await (await getDb()).update('platform_settings', { id: 'main' }, { feature_plus_enabled: true });
    const { r, byName } = await karahi();
    const { member } = await import('./helpers');
    const o = await createOrder({ user: await member(), restaurantId: r.id, fulfilment: 'delivery', idempotencyKey: 'plus-1', address: { line1: '1 Test St', city: 'Bradford', postcode: 'BD5 0AA' }, lines: [{ itemId: byName('Garlic naan').id, qty: 8, optionChoiceIds: [] }] });
    expect(o.service_fee_pence).toBe(99);
  });
});

describe('refund allocation (pure)', () => {
  const base = { subtotal_pence: 2500, discount_pence: 0, delivery_fee_pence: 300, tip_pence: 0, service_fee_pence: 99, total_pence: 2899, application_fee_pence: 349, refunded_pence: 0, refunded_food_pence: 0, refunded_delivery_pence: 0, refunded_tip_pence: 0, refunded_service_fee_pence: 0, commission_refunded_pence: 0 };
  it('full refund returns food, delivery and the 99p; commission goes back; restaurant share excludes the service fee', () => {
    const b = allocateRefund(base, { mode: 'all' });
    expect(b).toMatchObject({ amount_pence: 2899, food_pence: 2500, delivery_pence: 300, service_fee_pence: 99, commission_returned_pence: 250, restaurant_share_pence: 2550, platform_share_pence: 349 });
  });
  it('customer-cancel policy without service-fee refund keeps the 99p', () => {
    const b = allocateRefund(base, { mode: 'all_but_service_fee' });
    expect(b.service_fee_pence).toBe(0);
    expect(b.amount_pence).toBe(2800);
    expect(b.platform_share_pence).toBe(250);
  });
  it('partial food refund shrinks commission proportionally and never touches the service fee unless asked', () => {
    const b = allocateRefund(base, { mode: 'amount', amountPence: 1250 });
    expect(b).toMatchObject({ food_pence: 1250, service_fee_pence: 0, commission_returned_pence: 125, restaurant_share_pence: 1125 });
  });
  it('rejects a refund larger than the refundable remainder', () => {
    expect(() => allocateRefund(base, { mode: 'amount', amountPence: 2900 })).toThrow();
  });
  it('sequential partial refunds sum exactly to the order — no rounding drift', () => {
    let o = { ...base }; let commission = 0;
    for (const amt of [833, 833]) { const b = allocateRefund(o, { mode: 'amount', amountPence: amt }); commission += b.commission_returned_pence; o = { ...o, refunded_pence: o.refunded_pence + b.amount_pence, refunded_food_pence: o.refunded_food_pence + b.food_pence, refunded_delivery_pence: o.refunded_delivery_pence + b.delivery_pence, commission_refunded_pence: o.commission_refunded_pence + b.commission_returned_pence }; }
    const last = allocateRefund(o, { mode: 'all' });
    expect(commission + last.commission_returned_pence).toBe(250);
    expect(o.refunded_pence + last.amount_pence).toBe(2899);
  });
});

describe('refund execution', () => {
  const stripeMock = () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock0000000000000000';
    const refunds = { create: vi.fn().mockResolvedValue({ id: 're_1' }) };
    const transfers = { createReversal: vi.fn().mockResolvedValue({ id: 'trr_1' }) };
    const paymentIntents = { retrieve: vi.fn().mockResolvedValue({ latest_charge: { transfer: 'tr_1' } }) };
    __setStripeForTests({ refunds, transfers, paymentIntents });
    return { refunds, transfers, paymentIntents };
  };

  it('restaurant declines → customer gets food + delivery + 99p back; only the RESTAURANT share is reversed from the transfer', async () => {
    const m = stripeMock();
    const o = await paid('delivery', 6, 'pi_real_decl');
    await refundOrder(o.id, o.total_pence, 'Restaurant rejected the order', null, { kind: 'declined' });
    expect(m.refunds.create.mock.calls[0][0]).toMatchObject({ payment_intent: 'pi_real_decl', amount: o.total_pence });
    expect(m.refunds.create.mock.calls[0][0].reverse_transfer).toBeUndefined(); // no proportional auto-reversal
    expect(m.transfers.createReversal).toHaveBeenCalledWith('tr_1', expect.objectContaining({ amount: o.total_pence - o.commission_pence - 99 }), expect.anything());
    const after = await reload(o.id);
    expect(after.payment_status).toBe('refunded');
    expect(after.refunded_service_fee_pence).toBe(99);
    const [row] = await (await getDb()).select<OrderRefund>('order_refunds', { order_id: o.id });
    expect(row).toMatchObject({ kind: 'declined', service_fee_pence: 99, commission_returned_pence: o.commission_pence, restaurant_share_pence: o.total_pence - o.commission_pence - 99 });
  });

  it('a failed reversal never loses the customer refund; it is recorded for recovery', async () => {
    const m = stripeMock();
    m.transfers.createReversal.mockRejectedValue(new Error('insufficient funds'));
    const o = await paid('collection', 6, 'pi_real_rev');
    await refundOrder(o.id, 500, 'Missing item', null);
    const [row] = await (await getDb()).select<OrderRefund>('order_refunds', { order_id: o.id });
    expect(row.reversal_error).toMatch(/insufficient/);
    expect((await reload(o.id)).refunded_pence).toBe(500);
  });

  it('restaurant timeout refunds everything incl. the 99p', async () => {
    const o = await paid('collection', 6, 'pi_demo_to');
    await (await getDb()).update('orders', { id: o.id }, { paid_at: new Date(Date.now() - 60 * 60000).toISOString() });
    await processUnansweredOrders(new Date());
    const after = await reload(o.id);
    expect(after.payment_status).toBe('refunded');
    expect(after.refunded_service_fee_pence).toBe(99);
  });

  it('restaurant rejection through the dashboard refunds the 99p too', async () => {
    const o = await paid('delivery');
    await updateOrderStatus(o.id, 'rejected', await owner(), { reason: 'Sold out' });
    expect((await reload(o.id)).refunded_service_fee_pence).toBe(99);
  });

  it('customer-requested cancel follows the configurable policy', async () => {
    const a = await paid('collection', 6, 'pi_demo_c1');
    await refundOrder(a.id, a.total_pence, 'Customer cancelled', null, { kind: 'customer_cancel' });
    expect((await reload(a.id)).refunded_service_fee_pence).toBe(99);
    const admin = await sessionFor(DEMO_ACCOUNTS.admin);
    await applySettingsChange(admin.userId, { service_fee_refund_on_customer_cancel: false }, 'policy change');
    const b = await paid('collection', 6, 'pi_demo_c2');
    await refundOrder(b.id, b.total_pence, 'Customer cancelled', null, { kind: 'customer_cancel' });
    const after = await reload(b.id);
    expect(after.refunded_service_fee_pence).toBe(0);
    expect(after.refunded_pence).toBe(b.total_pence - 99);
  });

  it('RACE: Stripe\'s refund webhook arriving before refunds.create() returns is not logged a second time', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock0000000000000000';
    const o = await paid('delivery', 6, 'pi_real_race');
    const refunds = { create: vi.fn().mockImplementation(async () => { await reconcileRefund('pi_real_race', o.total_pence, 'ch_webhook'); return { id: 're_race' }; }) };
    __setStripeForTests({ refunds, transfers: { createReversal: vi.fn().mockResolvedValue({ id: 'trr_1' }) }, paymentIntents: { retrieve: vi.fn().mockResolvedValue({ latest_charge: { transfer: 'tr_1' } }) } });
    await refundOrder(o.id, o.total_pence, 'Restaurant rejected the order', null, { kind: 'declined' });
    const db = await getDb();
    expect((await db.select('order_refunds', { order_id: o.id }))).toHaveLength(1);
    expect((await db.select<any>('transactions', { order_id: o.id, kind: 'refund' }))).toHaveLength(1);
    expect((await reload(o.id)).refunded_pence).toBe(o.total_pence);
  });

  it('a Stripe failure releases the reservation so the refund can be retried', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock0000000000000000';
    const o = await paid('collection', 6, 'pi_real_fail');
    const create = vi.fn().mockRejectedValueOnce(new Error('stripe down')).mockResolvedValue({ id: 're_ok' });
    __setStripeForTests({ refunds: { create }, transfers: { createReversal: vi.fn().mockResolvedValue({ id: 'trr_2' }) }, paymentIntents: { retrieve: vi.fn().mockResolvedValue({ latest_charge: { transfer: 'tr_1' } }) } });
    await expect(refundOrder(o.id, o.total_pence, 'x', null)).rejects.toThrow(/stripe down/);
    expect((await reload(o.id)).refunded_pence).toBe(0);
    await refundOrder(o.id, o.total_pence, 'retry', null);
    expect((await reload(o.id)).payment_status).toBe('refunded');
  });

  it('a partial amount that would dip into the 99p gets a clear message, not a confusing limit', async () => {
    const o = await paid('collection', 6, 'pi_demo_msg');
    await expect(refundOrder(o.id, o.total_pence - 50, 'too much', null)).rejects.toThrow(/service fee is only refunded with the full remaining/);
  });

  it('refund cannot exceed what is left (no double refund)', async () => {
    const o = await paid('collection', 6, 'pi_demo_dbl');
    await refundOrder(o.id, o.total_pence, 'full', null);
    await expect(refundOrder(o.id, 1, 'again', null)).rejects.toThrow(/Refund must be/);
  });
});

describe('customer cancellation (only before the restaurant accepts)', () => {
  it('cancels a paid, unaccepted order and refunds everything including the 99p', async () => {
    const o = await paid('collection', 6, 'pi_demo_cc1');
    const out = await cancelOrderByCustomer(o.id, o.customer_id);
    expect(out.status).toBe('cancelled');
    expect(out.payment_status).toBe('refunded');
    expect(out.refunded_service_fee_pence).toBe(99);
  });
  it('honours the admin policy: when the 99p is not refundable on customer cancel, it is kept', async () => {
    const admin = await sessionFor(DEMO_ACCOUNTS.admin);
    await applySettingsChange(admin.userId, { service_fee_refund_on_customer_cancel: false }, 'policy');
    const o = await paid('collection', 6, 'pi_demo_cc2');
    const out = await cancelOrderByCustomer(o.id, o.customer_id);
    expect(out.refunded_service_fee_pence).toBe(0);
    expect(out.refunded_pence).toBe(o.total_pence - 99);
  });
  it('refuses once the restaurant has accepted, for another customer\'s order, and for unpaid orders', async () => {
    const accepted = await paid('collection', 6, 'pi_demo_cc3');
    await updateOrderStatus(accepted.id, 'accepted', await owner(), { readyInMinutes: 20 });
    await expect(cancelOrderByCustomer(accepted.id, accepted.customer_id)).rejects.toThrow(/before the restaurant accepts/);
    const mine = await paid('collection', 6, 'pi_demo_cc4');
    await expect(cancelOrderByCustomer(mine.id, 'someone-else')).rejects.toThrow(/not found/i);
    const unpaid = await place('collection');
    await expect(cancelOrderByCustomer(unpaid.id, unpaid.customer_id)).rejects.toThrow(/before the restaurant accepts/);
  });
  it('cannot be cancelled twice (no double refund)', async () => {
    const o = await paid('collection', 6, 'pi_demo_cc5');
    await cancelOrderByCustomer(o.id, o.customer_id);
    await expect(cancelOrderByCustomer(o.id, o.customer_id)).rejects.toThrow();
    expect((await reload(o.id)).refunded_pence).toBe(o.total_pence);
  });
  it('a failed Stripe refund puts the order back so nothing is lost', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock0000000000000000';
    const o = await paid('collection', 6, 'pi_real_cc6');
    __setStripeForTests({ refunds: { create: vi.fn().mockRejectedValue(new Error('stripe down')) } });
    await expect(cancelOrderByCustomer(o.id, o.customer_id)).rejects.toThrow(/stripe down/);
    const after = await reload(o.id);
    expect(after.status).toBe('awaiting_restaurant');
    expect(after.refunded_pence).toBe(0);
  });
});

describe('refund accounting always adds up', () => {
  it('a refund issued directly in Stripe after an in-app partial refund is still fully accounted for', async () => {
    const o = await paid('delivery', 6, 'pi_demo_ext');
    await refundOrder(o.id, 500, 'Missing item', null); // in-app partial: food 5.00
    await reconcileRefund('pi_demo_ext', 1500, 're_dash'); // someone refunds £10 more in the Stripe dashboard
    const after = await reload(o.id);
    expect(after.refunded_pence).toBe(1500);
    const { refundParts } = await import('@/lib/services/reports');
    const p = refundParts(after);
    expect(p.commission + p.service + p.restaurant).toBe(after.refunded_pence); // nothing lost or invented
    expect(p.commission).toBeGreaterThan(50); // more than just the 50p from the in-app refund
    expect(p.service).toBeLessThanOrEqual(99);
  });
  it('legacy orders (refunded before components existed) still split proportionally and add up', async () => {
    const o = await paid('collection', 6, 'pi_demo_legacy');
    const { refundParts } = await import('@/lib/services/reports');
    const legacy = { ...o, refunded_pence: 1000, refunded_food_pence: 0, refunded_delivery_pence: 0, refunded_tip_pence: 0, refunded_service_fee_pence: 0, commission_refunded_pence: 0 };
    const p = refundParts(legacy);
    expect(p.commission + p.service + p.restaurant).toBe(1000);
  });
});

describe('reporting', () => {
  it('restaurant earnings exclude the 99p; gross, refunds and net are food/delivery/tip only', async () => {
    const { r } = await karahi();
    const base = (await restaurantEarnings(r.id)).summary;
    const o = await paid('delivery');
    const s1 = (await restaurantEarnings(r.id)).summary;
    expect(s1.gross_pence - base.gross_pence).toBe(o.total_pence - 99);
    expect(s1.net_pence - base.net_pence).toBe(o.restaurant_net_pence);
    expect(s1.commission_pence - base.commission_pence).toBe(o.commission_pence);
    await refundOrder(o.id, o.total_pence, 'full', null);
    const s2 = (await restaurantEarnings(r.id)).summary;
    expect(s2.net_pence).toBe(base.net_pence);
    expect(s2.refunded_pence - base.refunded_pence).toBe(o.total_pence - 99); // the restaurant never sees the service-fee part
  });

  it('admin sees two revenue streams, delivery vs collection, and the stream split by group', async () => {
    const base = await breakdown();
    await paid('delivery', 6, 'pi_demo_r1'); await paid('collection', 6, 'pi_demo_r2');
    const b = await breakdown();
    expect(b.delivery_orders - base.delivery_orders).toBe(1);
    expect(b.collection_orders - base.collection_orders).toBe(1);
    expect(b.platform_service_fee_pence - base.platform_service_fee_pence).toBe(198);
    expect(b.platform_taxable_revenue_pence - base.platform_taxable_revenue_pence).toBe((b.platform_commission_pence - base.platform_commission_pence) + 198);
    for (const g of ['day', 'week', 'month', 'restaurant', 'city'] as const) {
      const rows = await revenueReport(g);
      expect(rows.reduce((s, r) => s + r.service_fee_pence, 0)).toBe(b.platform_service_fee_pence);
    }
  });

  it('unregistered: no VAT is added to the commission or the 99p, and no VAT invoice figures appear', async () => {
    const o = await paid();
    expect(o.commission_vat_pence).toBe(0);
    expect(o.service_fee_vat_pence).toBe(0);
    const b = await breakdown();
    expect(b.platform_vat_on_service_fee_pence).toBe(0);
    expect(b.platform_vat_on_commission_pence).toBe(0);
  });

  it('service fee income counts toward VAT-threshold monitoring', async () => {
    const before = (await vatStatus()).income_pence;
    const o = await paid('collection');
    const after = (await vatStatus()).income_pence;
    expect(after - before).toBe(o.commission_pence + 99);
  });

  it('Stripe fees come from real Stripe records only: unreconciled orders are flagged as estimates, never hard-coded as actual', async () => {
    const o = await paid('delivery');
    expect(o.stripe_fee_pence).toBeNull();
    const b = await breakdown();
    expect(b.orders_missing_fee_data).toBeGreaterThan(0);
    expect(b.processing_fees_estimated_pence).toBeGreaterThan(0);
    expect(b.processing_fees_actual_pence).toBe(0);
  });
});

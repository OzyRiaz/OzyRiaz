import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/lib/db';
import { extractProcessingFee, reconcileStripeFees, recordStripeFee } from '@/lib/services/reconcile';
import { applySettingsChange, getSettings, SettingsError } from '@/lib/services/settings';
import { vatStatus } from '@/lib/services/vat';
import { adminOverview, breakdown } from '@/lib/services/reports';
import { createOrder, markOrderPaid, refundOrder } from '@/lib/services/orders';
import { __setStripeForTests } from '@/lib/stripe';
import { customer, freshDb, karahi, sessionFor } from './helpers';
import { DEMO_ACCOUNTS } from '@/lib/demo-data';
import type { Order } from '@/lib/types';

async function paidOrder(qty = 8, fulfilment: 'delivery' | 'collection' = 'delivery', pi = 'pi_real_1') {
  const { r, byName } = await karahi();
  const o = await createOrder({ user: await customer(), restaurantId: r.id, fulfilment, idempotencyKey: crypto.randomUUID(), address: { line1: '1 Test St', city: 'Bradford', postcode: 'BD5 0AA' }, lines: [{ itemId: byName('Garlic naan').id, qty, optionChoiceIds: [] }] });
  await markOrderPaid(o.id, { amountPence: o.total_pence, paymentIntentId: pi, source: 'stripe' });
  return (await (await getDb()).get<Order>('orders', { id: o.id }))!;
}
beforeEach(async () => { await freshDb(); __setStripeForTests(null); delete process.env.STRIPE_SECRET_KEY; });

describe('commission settings are admin-controlled and audited', () => {
  it('records who/old/new/why for every audited change, and requires a reason', async () => {
    const admin = await sessionFor(DEMO_ACCOUNTS.admin);
    await expect(applySettingsChange(admin.userId, { commission_bps: 1100 }, '')).rejects.toThrow(/reason/);
    await applySettingsChange(admin.userId, { commission_bps: 1100 }, 'Agreed with first restaurants');
    expect((await getSettings()).commission_bps).toBe(1100);
    const log = await (await getDb()).select<any>('settings_audit');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ changed_by: admin.userId, field: 'commission_bps', old_value: '1000', new_value: '1100', reason: 'Agreed with first restaurants' });
  });
  it('rejects out-of-range commission', async () => {
    const admin = await sessionFor(DEMO_ACCOUNTS.admin);
    for (const bps of [-1, 3001, 10.5]) await expect(applySettingsChange(admin.userId, { commission_bps: bps }, 'x y z')).rejects.toThrow(SettingsError);
  });
  it('a rate change NEVER alters historical orders', async () => {
    const before = await paidOrder(8, 'delivery', 'pi_hist');
    const admin = await sessionFor(DEMO_ACCOUNTS.admin);
    await applySettingsChange(admin.userId, { commission_bps: 1500 }, 'test change');
    const after = (await (await getDb()).get<Order>('orders', { id: before.id }))!;
    expect(after.commission_bps).toBe(1000);
    expect(after.commission_pence).toBe(before.commission_pence);
    const next = await paidOrder(8, 'delivery', 'pi_new');
    expect(next.commission_bps).toBe(1500);
  });
  it('only admins can reach the settings action (guarded by requireRole at the action boundary)', async () => {
    const src = (await import('node:fs')).readFileSync('src/app/admin/actions.ts', 'utf8');
    expect(src).toMatch(/const admin = async \(\) => \{ const s = await requireRole\('admin'/);
    expect(src).toMatch(/saveSettingsAction[\s\S]*?await admin\(\)/);
  });
});

describe('actual Stripe processing fee reconciliation (Stripe is mocked — NOT a live verification)', () => {
  it('sums only stripe_fee types and reports other fee types separately', () => {
    expect(extractProcessingFee({ fee: 62, currency: 'gbp', fee_details: [{ type: 'stripe_fee', amount: 62 }] })).toEqual({ processing: 62, other: 0, otherTypes: [] });
    expect(extractProcessingFee({ fee: 100, currency: 'gbp', fee_details: [{ type: 'stripe_fee', amount: 62 }, { type: 'application_fee', amount: 38 }] })).toMatchObject({ processing: 62, other: 38, otherTypes: ['application_fee'] });
    expect(() => extractProcessingFee({ fee: 5, currency: 'eur' })).toThrow();
  });
  it('records the actual fee once, logs a transaction, and is idempotent', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock0000000000000000';
    const retrieve = vi.fn().mockResolvedValue({ latest_charge: { balance_transaction: { fee: 62, currency: 'gbp', fee_details: [{ type: 'stripe_fee', amount: 62 }] } } });
    __setStripeForTests({ paymentIntents: { retrieve } });
    const o = await paidOrder();
    expect(await recordStripeFee(o.id)).toEqual({ status: 'recorded', fee: 62 });
    expect(await recordStripeFee(o.id)).toEqual({ status: 'already', fee: 62 });
    expect(retrieve).toHaveBeenCalledTimes(1);
    const tx = await (await getDb()).select<any>('transactions', { order_id: o.id, kind: 'stripe_fee' });
    expect(tx).toHaveLength(1);
    expect(tx[0].amount_pence).toBe(-62);
  });
  it('leaves the fee unknown (not zero) when Stripe has not produced the balance transaction yet', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock0000000000000000';
    __setStripeForTests({ paymentIntents: { retrieve: vi.fn().mockResolvedValue({ latest_charge: { balance_transaction: null } }) } });
    const o = await paidOrder();
    expect((await recordStripeFee(o.id)).status).toBe('pending');
    expect((await (await getDb()).get<Order>('orders', { id: o.id }))!.stripe_fee_pence ?? null).toBeNull();
    expect((await reconcileStripeFees()).pending).toBe(1);
  });
});

describe('accountant-grade breakdown keeps customer money and FeastQuarter revenue separate', () => {
  it('delivery order: £19.20 food + £2.50 delivery', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock0000000000000000';
    __setStripeForTests({ paymentIntents: { retrieve: vi.fn().mockResolvedValue({ latest_charge: { balance_transaction: { fee: 55, currency: 'gbp', fee_details: [{ type: 'stripe_fee', amount: 55 }] } } }) } });
    const base = await breakdown();
    const o = await paidOrder(6, 'delivery');
    await recordStripeFee(o.id);
    const b = await breakdown();
    expect(b.food_sales_pence - base.food_sales_pence).toBe(1920);
    expect(b.delivery_charges_pence - base.delivery_charges_pence).toBe(250);
    expect(b.gross_customer_payments_pence - base.gross_customer_payments_pence).toBe(2170);
    expect(b.platform_commission_pence - base.platform_commission_pence).toBe(192); // 10% of FOOD only
    expect(b.restaurant_allocation_pence - base.restaurant_allocation_pence).toBe(2170 - 192);
    expect(b.platform_taxable_revenue_pence - base.platform_taxable_revenue_pence).toBe(192);
    expect(b.processing_fees_actual_pence - base.processing_fees_actual_pence).toBe(55);
    expect(b.net_contribution_pence - base.net_contribution_pence).toBe(192 - 55);
    expect(b.platform_taxable_revenue_pence).toBeLessThan(b.gross_customer_payments_pence); // never conflated
  });
  it('unreconciled orders are ESTIMATED and flagged, never silently treated as free', async () => {
    const base = await breakdown();
    await paidOrder(6, 'delivery', 'pi_demo_est');
    const b = await breakdown();
    expect(b.orders_missing_fee_data - base.orders_missing_fee_data).toBe(1);
    expect(b.processing_fees_estimated_pence).toBeGreaterThan(base.processing_fees_estimated_pence);
  });
  it('other Stripe/Connect costs entered by an admin reduce net contribution', async () => {
    const db = await getDb();
    const base = await breakdown();
    await db.insert('platform_expenses', { kind: 'stripe_connect_account', amount_pence: 200, incurred_on: new Date().toISOString(), note: 'Connect active account fee', created_by: null });
    const b = await breakdown();
    expect(b.other_stripe_costs_pence - base.other_stripe_costs_pence).toBe(200);
    expect(b.net_contribution_pence - base.net_contribution_pence).toBe(-200);
  });
  it('full refund removes the commission from revenue; partial refund removes it pro rata', async () => {
    const o = await paidOrder(10, 'collection', 'pi_demo_ref');   // £32.00 food, commission £3.20
    const base = await breakdown();
    await refundOrder(o.id, 1600, 'partial', null);                 // half refunded
    const half = await breakdown();
    expect(half.refunds_pence - base.refunds_pence).toBe(1600);
    expect(base.platform_commission_pence - half.platform_commission_pence).toBe(160);
    await refundOrder(o.id, 1600, 'rest', null);
    const full = await breakdown();
    expect(half.platform_commission_pence - full.platform_commission_pence).toBe(160);
  });
  it('admin overview counts, city rollup and top restaurants', async () => {
    await paidOrder(6, 'delivery', 'pi_demo_a');
    const ov = await adminOverview();
    expect(ov.orders_today).toBeGreaterThanOrEqual(1);
    expect(ov.by_city.find((c) => c.city === 'bradford')).toBeTruthy();
    expect(ov.top_restaurants.length).toBeGreaterThan(0);
    expect(ov.restaurants_registered).toBeGreaterThanOrEqual(ov.restaurants_active);
  });
});

describe('VAT threshold monitoring', () => {
  it('starts "ok" and unregistered; adds no VAT', async () => {
    const s = await getSettings();
    expect(s.platform_vat_registered).toBe(false);
    const v = await vatStatus();
    expect(v.level).toBe('ok');
    expect(v.registered).toBe(false);
  });
  it('escalates watch → urgent → exceeded as taxable income approaches the configurable threshold', async () => {
    await paidOrder(10, 'collection', 'pi_demo_v');                  // commission £3.20 (+ seeded demo orders)
    const income = (await vatStatus()).income_pence;
    const admin = await sessionFor(DEMO_ACCOUNTS.admin);
    for (const [pctOfThreshold, level] of [[0.75, 'watch'], [0.95, 'urgent'], [1.05, 'exceeded']] as const) {
      await applySettingsChange(admin.userId, { vat_threshold_pence: Math.round(income / pctOfThreshold) }, 'threshold test');
      expect((await vatStatus()).level).toBe(level);
    }
  });
  it('excludes customer food payments from taxable income (only commission + subscriptions count)', async () => {
    const o = await paidOrder(10, 'collection', 'pi_demo_x');
    const v = await vatStatus();
    expect(v.income_pence).toBeLessThan(o.total_pence * 5); // sanity: nowhere near gross payments
    const b = await breakdown();
    expect(v.income_pence).toBe(b.platform_taxable_revenue_pence);
  });
});

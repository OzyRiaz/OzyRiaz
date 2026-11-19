import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/demo-data';
import { estimateProcessingFee } from '@/lib/money';
import { chooseDiscount, computeTotals, memberDiscount, priceLine, promoDiscount, PricingError } from '@/lib/pricing';
import type { MenuItem, PlatformSettings, Promotion } from '@/lib/types';

const S = DEFAULT_SETTINGS as unknown as PlatformSettings;
const SP = { ...S, feature_plus_enabled: true };

describe('commission — flat 10% on food, delivery and collection', () => {
  it('uses integer basis points: commission_bps = 1000 by default', () => expect(S.commission_bps).toBe(1000));

  it('Example A — delivery: £25 food + £3 delivery + 99p service fee → customer £28.99, commission £2.50, restaurant £25.50, FeastQuarter gross £3.49', () => {
    const t = computeTotals({ subtotal: 2500, deliveryFee: 300, fulfilment: 'delivery', settings: S, discount: null });
    expect(t.service_fee_pence).toBe(99);
    expect(t.total_pence).toBe(2899);
    expect(t.commission_bps).toBe(1000);
    expect(t.commission_pence).toBe(250);
    expect(t.application_fee_pence).toBe(349); // commission + service fee, collected in ONE Stripe application fee
    expect(t.restaurant_net_pence).toBe(2550); // food + delivery − commission. The 99p never reaches the restaurant.
    const processing = estimateProcessingFee(t.total_pence); // ILLUSTRATIVE ONLY (1.5% + 20p). Real fees are read from Stripe balance transactions.
    expect(processing).toBe(63);
    expect(t.application_fee_pence - processing).toBe(286); // contribution before Connect costs, refunds, tax
  });

  it('Example B — collection: £25 food + 99p service fee → customer £25.99, commission £2.50, restaurant £22.50, FeastQuarter gross £3.49', () => {
    const t = computeTotals({ subtotal: 2500, deliveryFee: 300 /* ignored for collection */, fulfilment: 'collection', settings: S, discount: null });
    expect(t.delivery_fee_pence).toBe(0);
    expect(t.total_pence).toBe(2599);
    expect(t.commission_pence).toBe(250);
    expect(t.application_fee_pence).toBe(349);
    expect(t.restaurant_net_pence).toBe(2250);
    const processing = estimateProcessingFee(t.total_pence);
    expect(processing).toBe(59);
    expect(t.application_fee_pence - processing).toBe(290);
  });

  it('service fee is a settings value (99), identical for delivery and collection, and 0 when the admin sets 0', () => {
    expect(S.customer_service_fee_pence).toBe(99);
    const d = computeTotals({ subtotal: 1000, deliveryFee: 200, fulfilment: 'delivery', settings: S, discount: null });
    const c = computeTotals({ subtotal: 1000, deliveryFee: 200, fulfilment: 'collection', settings: S, discount: null });
    expect(d.service_fee_pence).toBe(c.service_fee_pence);
    expect(computeTotals({ subtotal: 1000, deliveryFee: 0, fulfilment: 'delivery', settings: { ...S, customer_service_fee_pence: 0 }, discount: null }).total_pence).toBe(1000);
  });

  it('service fee is not commissionable: changing it never changes commission or the restaurant allocation', () => {
    const a = computeTotals({ subtotal: 2500, deliveryFee: 300, fulfilment: 'delivery', settings: { ...S, customer_service_fee_pence: 99 }, discount: null });
    const b = computeTotals({ subtotal: 2500, deliveryFee: 300, fulfilment: 'delivery', settings: { ...S, customer_service_fee_pence: 250 }, discount: null });
    expect(b.commission_pence).toBe(a.commission_pence);
    expect(b.restaurant_net_pence).toBe(a.restaurant_net_pence);
    expect(b.total_pence - a.total_pence).toBe(151);
  });

  it('delivery and collection pay the SAME rate on the same food', () => {
    const d = computeTotals({ subtotal: 3333, deliveryFee: 250, fulfilment: 'delivery', settings: S, discount: null });
    const c = computeTotals({ subtotal: 3333, deliveryFee: 250, fulfilment: 'collection', settings: S, discount: null });
    expect(d.commission_pence).toBe(c.commission_pence);
  });

  it('delivery fee is never commissionable (huge delivery fee changes nothing)', () => {
    const a = computeTotals({ subtotal: 2000, deliveryFee: 0, fulfilment: 'delivery', settings: S, discount: null });
    const b = computeTotals({ subtotal: 2000, deliveryFee: 9900, fulfilment: 'delivery', settings: S, discount: null });
    expect(b.commission_pence).toBe(a.commission_pence);
    expect(b.restaurant_net_pence - a.restaurant_net_pence).toBe(9900);
  });

  it('tips are never commissionable and go entirely to the restaurant', () => {
    const base = computeTotals({ subtotal: 2500, deliveryFee: 300, fulfilment: 'delivery', settings: S, discount: null });
    const tipped = computeTotals({ subtotal: 2500, deliveryFee: 300, fulfilment: 'delivery', settings: S, discount: null, tip: 500 });
    expect(tipped.tip_pence).toBe(500);
    expect(tipped.total_pence).toBe(base.total_pence + 500);
    expect(tipped.commission_pence).toBe(base.commission_pence);
    expect(tipped.application_fee_pence).toBe(base.application_fee_pence);
    expect(tipped.restaurant_net_pence).toBe(base.restaurant_net_pence + 500);
  });

  it('the only customer charge besides food, delivery and tip is the 99p service fee — no card surcharge', () => {
    const t = computeTotals({ subtotal: 2500, deliveryFee: 300, fulfilment: 'delivery', settings: S, discount: null });
    expect(t.total_pence).toBe(t.subtotal_pence + t.delivery_fee_pence + t.service_fee_pence); // nothing else added to what the customer pays
    expect(t.restaurant_net_pence + t.application_fee_pence).toBe(t.total_pence); // the restaurant is not charged anything extra
  });

  it('uses an admin-changed rate for NEW calculations only (rate is stored per order)', () => {
    const t = computeTotals({ subtotal: 1000, deliveryFee: 0, fulfilment: 'delivery', settings: { ...S, commission_bps: 1200 }, discount: null });
    expect(t.commission_pence).toBe(120);
    expect(t.commission_bps).toBe(1200);
  });
  it('rounds to whole pence', () => {
    expect(computeTotals({ subtotal: 1234, deliveryFee: 0, fulfilment: 'delivery', settings: S, discount: null }).commission_pence).toBe(123); // 123.4
    expect(computeTotals({ subtotal: 1235, deliveryFee: 0, fulfilment: 'delivery', settings: S, discount: null }).commission_pence).toBe(124); // 123.5 → half up
  });

  it('restaurant-funded discount: commission is on the food actually charged; restaurant bears the discount', () => {
    const t = computeTotals({ subtotal: 2000, deliveryFee: 0, fulfilment: 'collection', settings: S, discount: { label: 'x', amountPence: 400, fundedBy: 'restaurant' } });
    expect(t.total_pence).toBe(1699);
    expect(t.commission_pence).toBe(160);
    expect(t.restaurant_net_pence).toBe(1440);
    expect(t.discount_funded_by_restaurant_pence).toBe(400);
  });
  it('platform-funded discount comes out of FeastQuarter commission, is capped at it, and is tracked separately', () => {
    const t = computeTotals({ subtotal: 2000, deliveryFee: 0, fulfilment: 'delivery', settings: S, discount: { label: 'x', amountPence: 1000, fundedBy: 'platform', promoCode: 'X' } });
    expect(t.commission_pence).toBe(200);
    expect(t.discount_pence).toBe(200);
    expect(t.discount_funded_by_platform_pence).toBe(200);
    expect(t.application_fee_pence).toBe(99); // commission fully waived by the platform-funded discount; the 99p stays
    expect(t.total_pence).toBe(1899);
    expect(t.restaurant_net_pence).toBe(1800); // restaurant is made whole: food − full commission
  });
  it('invariant: total = restaurant allocation + application fee; fee never negative (all combinations)', () => {
    for (const sub of [100, 999, 1500, 2500, 5555]) for (const f of ['delivery', 'collection'] as const) for (const funded of ['restaurant', 'platform'] as const) for (const d of [0, 50, 300, 99999]) for (const tip of [0, 150]) {
      const t = computeTotals({ subtotal: sub, deliveryFee: 199, fulfilment: f, settings: S, discount: d ? { label: 'd', amountPence: d, fundedBy: funded } : null, tip });
      expect(t.total_pence).toBe(t.restaurant_net_pence + t.application_fee_pence);
      expect(t.application_fee_pence).toBeGreaterThanOrEqual(0);
      expect(t.total_pence).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('VAT on FeastQuarter commission (configuration only; not a statement of legal treatment)', () => {
  it('adds NO VAT while FeastQuarter is unregistered, whatever mode is set', () => {
    for (const mode of ['none', 'inclusive', 'exclusive'] as const) {
      const t = computeTotals({ subtotal: 2500, deliveryFee: 300, fulfilment: 'delivery', settings: { ...S, platform_vat_registered: false, commission_vat_mode: mode }, discount: null });
      expect(t.commission_vat_pence).toBe(0);
      expect(t.service_fee_vat_pence).toBe(0);
      expect(t.application_fee_pence).toBe(349);
    }
    expect(S.platform_vat_registered).toBe(false);
  });
  it('inclusive: VAT is extracted from the fee, fee and restaurant allocation unchanged', () => {
    const t = computeTotals({ subtotal: 2500, deliveryFee: 0, fulfilment: 'collection', settings: { ...S, platform_vat_registered: true, commission_vat_mode: 'inclusive' }, discount: null });
    expect(t.application_fee_pence).toBe(349);
    expect(t.commission_vat_pence).toBe(42); // 250 × 20/120
    expect(t.service_fee_vat_pence).toBe(0); // service fee VAT mode is separate and defaults to none
    expect(t.restaurant_net_pence).toBe(2250);
  });
  it('exclusive: VAT is added on top of the fee', () => {
    const t = computeTotals({ subtotal: 2500, deliveryFee: 0, fulfilment: 'collection', settings: { ...S, platform_vat_registered: true, commission_vat_mode: 'exclusive' }, discount: null });
    expect(t.commission_vat_pence).toBe(50);
    expect(t.application_fee_pence).toBe(399); // 250 + 50 VAT + 99
    expect(t.restaurant_net_pence).toBe(2200);
  });
});

describe('VAT on the service fee (configuration only)', () => {
  it('unregistered: no VAT on the 99p whatever the mode, and the customer still pays exactly 99p', () => {
    for (const mode of ['none', 'inclusive', 'exclusive'] as const) {
      const t = computeTotals({ subtotal: 2500, deliveryFee: 0, fulfilment: 'collection', settings: { ...S, platform_vat_registered: false, service_fee_vat_mode: mode }, discount: null });
      expect(t.service_fee_vat_pence).toBe(0);
      expect(t.total_pence).toBe(2599);
    }
  });
  it('registered + inclusive: VAT is extracted from the 99p and the customer price does not change', () => {
    const t = computeTotals({ subtotal: 2500, deliveryFee: 0, fulfilment: 'collection', settings: { ...S, platform_vat_registered: true, service_fee_vat_mode: 'inclusive' }, discount: null });
    expect(t.service_fee_vat_pence).toBe(17); // 99 × 20/120
    expect(t.total_pence).toBe(2599);
  });
  it('registered + exclusive: VAT is added ON TOP (a deliberate, approval-gated price change)', () => {
    const t = computeTotals({ subtotal: 2500, deliveryFee: 0, fulfilment: 'collection', settings: { ...S, platform_vat_registered: true, service_fee_vat_mode: 'exclusive' }, discount: null });
    expect(t.service_fee_vat_pence).toBe(20);
    expect(t.total_pence).toBe(2619);
  });
});

describe('discounts', () => {
  const offer = { enabled: true, percent: 25, min_spend_pence: 1500, description: '' };
  it('caps member percent at the admin maximum', () => {
    expect(memberDiscount(2000, offer, SP)!.amountPence).toBe(400); // 20% cap, not 25%
  });
  it('requires minimum spend and enabled offer', () => {
    expect(memberDiscount(1000, offer, SP)).toBeNull();
    expect(memberDiscount(2000, { ...offer, enabled: false }, SP)).toBeNull();
  });
  it('member discount funding follows the admin setting', () => {
    expect(memberDiscount(2000, offer, { ...SP, member_discount_funding: 'platform' })!.fundedBy).toBe('platform');
  });
  it('FeastQuarter Plus is OFF at launch: no member discount is ever applied while the flag is off', () => {
    expect(S.feature_plus_enabled).toBe(false);
    expect(memberDiscount(2000, offer, S)).toBeNull();
  });
  it('never stacks discounts: picks the largest', () => {
    expect(chooseDiscount([{ label: 'a', amountPence: 100, fundedBy: 'restaurant' }, { label: 'b', amountPence: 300, fundedBy: 'platform' }])!.label).toBe('b');
    expect(chooseDiscount([])).toBeNull();
  });
  const promo: Promotion = { id: '1', code: 'X', description: '', kind: 'percent', value: 10, min_spend_pence: 1000, active: true, starts_at: null, ends_at: null, max_uses: 1, used_count: 0, funded_by: 'platform', restaurant_id: null, city_slug: null, created_at: '' };
  it('validates promo rules', () => {
    expect(promoDiscount(2000, promo, 'r')).toMatchObject({ amountPence: 200 });
    expect(promoDiscount(500, promo, 'r')).toHaveProperty('error');
    expect(promoDiscount(2000, { ...promo, used_count: 1 }, 'r')).toHaveProperty('error');
    expect(promoDiscount(2000, { ...promo, active: false }, 'r')).toHaveProperty('error');
    expect(promoDiscount(2000, { ...promo, ends_at: '2000-01-01' }, 'r')).toHaveProperty('error');
    expect(promoDiscount(2000, { ...promo, restaurant_id: 'other' }, 'r')).toHaveProperty('error');
    expect(promoDiscount(2000, { ...promo, city_slug: 'leeds' }, 'r', new Date(), 'bradford')).toHaveProperty('error'); // city-scoped
    expect(promoDiscount(2000, { ...promo, city_slug: 'bradford' }, 'r', new Date(), 'bradford')).toMatchObject({ amountPence: 200 });
  });
});

describe('priceLine', () => {
  const item = {
    id: 'i', name: 'Pizza', price_pence: 1000, available: true, allergens: [], option_groups: [
      { id: 'g', name: 'Size', min: 1, max: 1, choices: [{ id: 'a', name: 'S', price_pence: 0 }, { id: 'b', name: 'L', price_pence: 300 }] },
    ],
  } as unknown as MenuItem;
  it('adds extras server-side', () => expect(priceLine(item, { itemId: 'i', qty: 2, optionChoiceIds: ['b'] }).unit_price_pence).toBe(1300));
  it('enforces required groups, max and unknown choices', () => {
    expect(() => priceLine(item, { itemId: 'i', qty: 1, optionChoiceIds: [] })).toThrow(PricingError);
    expect(() => priceLine(item, { itemId: 'i', qty: 1, optionChoiceIds: ['a', 'b'] })).toThrow(PricingError);
    expect(() => priceLine(item, { itemId: 'i', qty: 1, optionChoiceIds: ['a', 'zzz'] })).toThrow(PricingError);
  });
  it('rejects unavailable items and bad quantities', () => {
    expect(() => priceLine({ ...item, available: false }, { itemId: 'i', qty: 1, optionChoiceIds: ['a'] })).toThrow();
    expect(() => priceLine(item, { itemId: 'i', qty: 0, optionChoiceIds: ['a'] })).toThrow();
    expect(() => priceLine(item, { itemId: 'i', qty: 1.5, optionChoiceIds: ['a'] })).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/demo-data';
import { chooseDiscount, computeTotals, memberDiscount, priceLine, promoDiscount, PricingError } from '@/lib/pricing';
import type { MenuItem, PlatformSettings, Promotion } from '@/lib/types';

const S = DEFAULT_SETTINGS as unknown as PlatformSettings;

describe('commission', () => {
  it('charges 8% on delivery food orders and keeps delivery fee out of the commission base', () => {
    const t = computeTotals({ subtotal: 2000, deliveryFee: 250, fulfilment: 'delivery', settings: S, discount: null });
    expect(t.commission_bps).toBe(800);
    expect(t.commission_pence).toBe(160);
    expect(t.total_pence).toBe(2250);
    expect(t.application_fee_pence).toBe(160);
    expect(t.restaurant_net_pence).toBe(2090); // food 1840 + delivery 250
  });
  it('charges 5% on collection and ignores any delivery fee', () => {
    const t = computeTotals({ subtotal: 2000, deliveryFee: 250, fulfilment: 'collection', settings: S, discount: null });
    expect(t.commission_bps).toBe(500);
    expect(t.delivery_fee_pence).toBe(0);
    expect(t.total_pence).toBe(2000);
    expect(t.application_fee_pence).toBe(100);
  });
  it('uses admin-changed commission rates', () => {
    const t = computeTotals({ subtotal: 1000, deliveryFee: 0, fulfilment: 'delivery', settings: { ...S, commission_delivery_bps: 1000 }, discount: null });
    expect(t.commission_pence).toBe(100);
  });
  it('rounds to whole pence', () => {
    const t = computeTotals({ subtotal: 1234, deliveryFee: 0, fulfilment: 'delivery', settings: S, discount: null });
    expect(t.commission_pence).toBe(99); // 98.72
  });
  it('restaurant-funded discount lowers the commission base and the restaurant bears it', () => {
    const t = computeTotals({ subtotal: 2000, deliveryFee: 0, fulfilment: 'collection', settings: S, discount: { label: 'x', amountPence: 400, fundedBy: 'restaurant' } });
    expect(t.total_pence).toBe(1600);
    expect(t.commission_pence).toBe(80);
    expect(t.application_fee_pence).toBe(80);
    expect(t.restaurant_net_pence).toBe(1520);
  });
  it('platform-funded discount is paid from BD Feast commission and is capped by it', () => {
    const t = computeTotals({ subtotal: 2000, deliveryFee: 0, fulfilment: 'delivery', settings: S, discount: { label: 'x', amountPence: 1000, fundedBy: 'platform', promoCode: 'X' } });
    expect(t.commission_pence).toBe(160);
    expect(t.discount_pence).toBe(160); // capped
    expect(t.application_fee_pence).toBe(0);
    expect(t.total_pence).toBe(1840);
    expect(t.restaurant_net_pence).toBe(1840); // restaurant still gets food minus full commission
  });
  it('invariant: customer pays total = restaurant net + application fee, never negative', () => {
    for (const sub of [100, 999, 1500, 5555]) for (const f of ['delivery', 'collection'] as const) for (const funded of ['restaurant', 'platform'] as const) for (const d of [0, 50, 300, 99999]) {
      const t = computeTotals({ subtotal: sub, deliveryFee: 199, fulfilment: f, settings: S, discount: d ? { label: 'd', amountPence: d, fundedBy: funded } : null });
      expect(t.total_pence).toBe(t.restaurant_net_pence + t.application_fee_pence);
      expect(t.application_fee_pence).toBeGreaterThanOrEqual(0);
      expect(t.total_pence).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('discounts', () => {
  const offer = { enabled: true, percent: 25, min_spend_pence: 1500, description: '' };
  it('caps member percent at the admin maximum', () => {
    expect(memberDiscount(2000, offer, S)!.amountPence).toBe(400); // 20% cap, not 25%
  });
  it('requires minimum spend and enabled offer', () => {
    expect(memberDiscount(1000, offer, S)).toBeNull();
    expect(memberDiscount(2000, { ...offer, enabled: false }, S)).toBeNull();
  });
  it('member discount funding follows the admin setting', () => {
    expect(memberDiscount(2000, offer, { ...S, member_discount_funding: 'platform' })!.fundedBy).toBe('platform');
  });
  it('never stacks discounts: picks the largest', () => {
    expect(chooseDiscount([{ label: 'a', amountPence: 100, fundedBy: 'restaurant' }, { label: 'b', amountPence: 300, fundedBy: 'platform' }])!.label).toBe('b');
    expect(chooseDiscount([])).toBeNull();
  });
  const promo: Promotion = { id: '1', code: 'X', description: '', kind: 'percent', value: 10, min_spend_pence: 1000, active: true, starts_at: null, ends_at: null, max_uses: 1, used_count: 0, funded_by: 'platform', restaurant_id: null, created_at: '' };
  it('validates promo rules', () => {
    expect(promoDiscount(2000, promo, 'r')).toMatchObject({ amountPence: 200 });
    expect(promoDiscount(500, promo, 'r')).toHaveProperty('error');
    expect(promoDiscount(2000, { ...promo, used_count: 1 }, 'r')).toHaveProperty('error');
    expect(promoDiscount(2000, { ...promo, active: false }, 'r')).toHaveProperty('error');
    expect(promoDiscount(2000, { ...promo, ends_at: '2000-01-01' }, 'r')).toHaveProperty('error');
    expect(promoDiscount(2000, { ...promo, restaurant_id: 'other' }, 'r')).toHaveProperty('error');
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

import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { CityError, getActiveCities, getCities, setCityActive, upsertCity } from '@/lib/services/cities';
import { buildQuote } from '@/lib/services/quote';
import { listRestaurants } from '@/lib/services/restaurants';
import { courierPricing, CourierDisabledError, getCourier, listCouriers } from '@/lib/couriers';
import { gophr, uberDirect } from '@/lib/couriers/providers';
import { freshDb, karahi } from './helpers';

beforeEach(async () => { await freshDb(); });

describe('multi-city architecture', () => {
  it('Bradford is live; Leeds and Manchester are configured but inactive', async () => {
    expect((await getActiveCities()).map((c) => c.slug)).toEqual(['bradford']);
    expect((await getCities()).map((c) => c.slug)).toEqual(expect.arrayContaining(['bradford', 'leeds', 'manchester']));
  });
  it('a Leeds restaurant can join through the same system and goes live when the city is activated — no code change', async () => {
    const db = await getDb();
    const { r } = await karahi();
    // Same restaurant record shape, different city/postcode, added through the normal tables.
    const leeds = await db.insert<any>('restaurants', { ...r, id: crypto.randomUUID(), slug: 'leeds-test', name: 'Leeds Test Kitchen', postcode: 'LS1 4AA', city_slug: 'leeds', is_demo: false, stripe_account_id: 'acct_leeds' });
    const area = await db.insert<any>('delivery_areas', { restaurant_id: leeds.id, name: 'Leeds centre', postcode_prefixes: ['LS1', 'LS2'], fee_pence: 300, min_order_pence: null });
    const cat = await db.insert<any>('menu_categories', { restaurant_id: leeds.id, name: 'Mains', sort: 0 });
    const item = await db.insert<any>('menu_items', { restaurant_id: leeds.id, category_id: cat.id, name: 'Test dish', description: '', price_pence: 1500, image_url: null, available: true, allergens: [], allergen_info_confirmed: true, dietary: [], option_groups: [], sort: 0 });
    expect(area).toBeTruthy();
    // City inactive: Leeds postcodes are not served.
    expect(await listRestaurants({ postcode: 'LS1 4AA' })).toHaveLength(0);
    await expect(buildQuote({ restaurantId: leeds.id, lines: [{ itemId: item.id, qty: 1, optionChoiceIds: [] }], fulfilment: 'delivery', postcode: 'LS1 4AA' })).rejects.toThrow(/not available in your area/);
    // Activate Leeds in admin config.
    await setCityActive('leeds', true);
    expect((await listRestaurants({ postcode: 'LS1 4AA' })).map((x) => x.slug)).toContain('leeds-test');
    const q = await buildQuote({ restaurantId: leeds.id, lines: [{ itemId: item.id, qty: 1, optionChoiceIds: [] }], fulfilment: 'delivery', postcode: 'LS1 4AA' });
    expect(q.commission_pence).toBe(150); // same flat 10% everywhere
    // Bradford customers are not shown Leeds restaurants.
    expect((await listRestaurants({ postcode: 'BD5 0AA' })).map((x) => x.slug)).not.toContain('leeds-test');
  });
  it('new cities start inactive and are validated', async () => {
    await upsertCity({ slug: 'sheffield', name: 'Sheffield', areas: ['S'] });
    expect((await getActiveCities()).map((c) => c.slug)).not.toContain('sheffield');
    await expect(upsertCity({ slug: 'Bad Slug', name: 'x', areas: ['S'] })).rejects.toThrow(CityError);
    await expect(upsertCity({ slug: 'ok', name: 'x', areas: ['BD5'] })).rejects.toThrow(CityError);
    await expect(setCityActive('nowhere', true)).rejects.toThrow(CityError);
  });
});

describe('courier abstraction — all paid providers disabled at launch', () => {
  it('lists every provider as disabled and explains why', () => {
    const l = listCouriers();
    expect(l.map((c) => c.id)).toEqual(['gophr', 'uber_direct']);
    expect(l.every((c) => !c.enabled && /agreement|credentials/.test(c.reason))).toBe(true);
  });
  it('every operation refuses without any network call', async () => {
    const orig = globalThis.fetch;
    let calls = 0; globalThis.fetch = (async () => { calls++; return new Response('{}'); }) as typeof fetch;
    try {
      for (const p of [gophr, uberDirect]) {
        const req = { orderId: 'o', pickup: { line1: 'a', city: 'b', postcode: 'BD1 1AA', name: 'n', phone: 'p' }, dropoff: { line1: 'a', city: 'b', postcode: 'BD2 1AA', phone: 'p' }, itemsDescription: 'food' };
        await expect(p.checkAvailability(req)).rejects.toThrow(CourierDisabledError);
        await expect(p.quote(req)).rejects.toThrow(CourierDisabledError);
        await expect(p.track('x')).rejects.toThrow(CourierDisabledError);
        await expect(p.cancel('x')).rejects.toThrow(CourierDisabledError);
      }
      expect(() => getCourier('gophr')).toThrow(CourierDisabledError);
      expect(calls).toBe(0);
    } finally { globalThis.fetch = orig; }
  });
  it('no courier subsidy unless expressly authorised; customer pays the quoted cost', () => {
    expect(courierPricing(650, 300, false)).toEqual({ customer_fee_pence: 650, subsidy_pence: 0, provider_cost_pence: 650 });
    expect(courierPricing(650, 300, true)).toEqual({ customer_fee_pence: 350, subsidy_pence: 300, provider_cost_pence: 650 });
    expect(courierPricing(650, 9999, true).customer_fee_pence).toBe(0); // subsidy capped at the quote
  });
});

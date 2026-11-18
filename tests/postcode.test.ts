import { describe, expect, it } from 'vitest';
import { areaMatches, parsePostcode, parseOutwardOnly, postcodeInServedCity } from '@/lib/postcode';
import { matchArea } from '@/lib/services/restaurants';
import { nextRestaurantStatuses, canTransition } from '@/lib/order-state';
import { csv } from '@/lib/services/reports';

describe('postcodes', () => {
  it('normalises UK postcodes', () => {
    expect(parsePostcode('bd50aa')?.normalised).toBe('BD5 0AA');
    expect(parsePostcode(' BD1 1AA ')?.outward).toBe('BD1');
    expect(parsePostcode('nonsense')).toBeNull();
    expect(parseOutwardOnly('bd10')).toBe('BD10');
  });
  it('BD1 does not match BD10 or BD11', () => {
    expect(areaMatches('BD1', { outward: 'BD10' })).toBe(false);
    expect(areaMatches('BD1', { outward: 'BD1' })).toBe(true);
  });
  it('supports sector-level areas', () => {
    expect(areaMatches('BD5 0', { outward: 'BD5', sector: 'BD5 0' })).toBe(true);
    expect(areaMatches('BD5 0', { outward: 'BD5', sector: 'BD5 9' })).toBe(false);
  });
  it('only active cities are served (Leeds is planned, not live)', () => {
    expect(postcodeInServedCity({ outward: 'BD5' })?.slug).toBe('bradford');
    expect(postcodeInServedCity({ outward: 'LS1' })).toBeNull();
    expect(postcodeInServedCity({ outward: 'M1' })).toBeNull();
  });
  it('prefers the more specific sector area', () => {
    const a = (id: string, p: string[], fee: number) => ({ id, restaurant_id: 'r', name: id, postcode_prefixes: p, fee_pence: fee, min_order_pence: null });
    expect(matchArea([a('wide', ['BD5'], 400), a('near', ['BD5 0'], 150)], 'BD5 0AA')!.id).toBe('near');
    expect(matchArea([a('wide', ['BD5'], 400), a('near', ['BD5 0'], 150)], 'BD5 9AA')!.id).toBe('wide');
  });
});

describe('order state machine', () => {
  it('delivery and collection take different paths', () => {
    expect(nextRestaurantStatuses('ready', 'delivery')).toEqual(['out_for_delivery']);
    expect(nextRestaurantStatuses('ready', 'collection')).toEqual(['completed']);
  });
  it('cannot skip steps or act on unpaid/terminal orders', () => {
    expect(canTransition('awaiting_restaurant', 'completed', 'delivery')).toBe(false);
    expect(canTransition('pending_payment', 'accepted', 'delivery')).toBe(false);
    expect(canTransition('completed', 'preparing', 'delivery')).toBe(false);
  });
});

describe('csv export', () => {
  it('escapes and neutralises formula injection', () => {
    const out = csv([{ a: '=HYPERLINK("x")', b: 'hello, world' }]);
    expect(out).toContain(`"'=HYPERLINK(""x"")"`);
    expect(out).toContain('"hello, world"');
  });
});

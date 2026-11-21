import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { setFoundingPartner } from '@/lib/services/restaurants';
import { karahi, freshDb } from './helpers';
import type { Restaurant } from '@/lib/types';

beforeEach(async () => { await freshDb(); });

describe('founding partner record', () => {
  it('can be set and cleared, keeps the original join date, and is only a record (nothing else changes)', async () => {
    const { r } = await karahi();
    const db = await getDb();
    const before = (await db.get<Restaurant>('restaurants', { id: r.id }))!;
    const on = await setFoundingPartner(r.id, true);
    expect(on.restaurant.founding_partner).toBe(true);
    const since = on.restaurant.founding_partner_since;
    expect(since).toBeTruthy();
    expect((await setFoundingPartner(r.id, true)).restaurant.founding_partner_since).toBe(since); // marking twice does not move the date
    const after = (await db.get<Restaurant>('restaurants', { id: r.id }))!;
    expect({ ...after, founding_partner: before.founding_partner, founding_partner_since: before.founding_partner_since }).toEqual(before); // no other field touched
    const off = await setFoundingPartner(r.id, false);
    expect(off.restaurant.founding_partner).toBe(false);
    expect(off.restaurant.founding_partner_since).toBeNull();
  });
  it('the count ignores demo restaurants', async () => {
    const { r } = await karahi(); // a demo restaurant
    expect((await setFoundingPartner(r.id, true)).count).toBe(0);
  });
  it('rejects an unknown restaurant', async () => {
    await expect(setFoundingPartner('does-not-exist', true)).rejects.toThrow(/not found/i);
  });
});

describe('founding partner is admin-only and never public', () => {
  it('the admin action is behind the admin guard, and owners cannot flag themselves in the database', () => {
    const actions = readFileSync('src/app/admin/actions.ts', 'utf8');
    const fn = actions.slice(actions.indexOf('export async function foundingPartnerAction'));
    expect(fn.slice(0, 200)).toMatch(/await admin\(\)/);
    const sql = readFileSync('supabase/migrations/0009_founding_partner.sql', 'utf8');
    expect(sql).toMatch(/new\.founding_partner <> old\.founding_partner/);
    expect(sql).toMatch(/set search_path = public/);
  });
  it('is not shown on any customer-facing or restaurant-facing page', () => {
    for (const f of ['src/app/restaurants/[slug]/page.tsx', 'src/components/RestaurantCard.tsx', 'src/app/partner/page.tsx', 'src/app/dashboard/page.tsx']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/founding/i);
    }
  });
  it('the public joining-fee wording is unchanged', () => {
    expect(readFileSync('src/app/partner/page.tsx', 'utf8')).toMatch(/No joining fee or monthly subscription\./);
  });
});

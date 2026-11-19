import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/demo-data';

describe('launch commercial terms', () => {
  it('there is no joining fee, monthly restaurant fee, equipment fee or card surcharge in the data model; the only customer fee is the 99p service fee', () => {
    const settingsKeys = Object.keys(DEFAULT_SETTINGS).join(' ');
    expect(settingsKeys).not.toMatch(/joining|monthly_fee|subscription_fee|equipment|card_fee|surcharge/i);
    expect(DEFAULT_SETTINGS.customer_service_fee_pence).toBe(99);
    expect(DEFAULT_SETTINGS.commission_bps).toBe(1000);
    const schema = readFileSync('supabase/migrations/0001_schema.sql', 'utf8') + readFileSync('supabase/migrations/0004_launch_model.sql', 'utf8') + readFileSync('supabase/migrations/0007_service_fee_refunds.sql', 'utf8');
    expect(schema).not.toMatch(/joining_fee|monthly_fee|equipment_fee|card_surcharge/i);
  });
  it('the restaurant-facing offer states: no joining fee, no monthly fee, flat commission incl. card processing', () => {
    const partner = readFileSync('src/app/partner/page.tsx', 'utf8');
    expect(partner).toMatch(/No joining fee/);
    expect(partner).toMatch(/No monthly fee/);
    expect(partner).toMatch(/Standard card processing is included/);
    expect(partner).not.toMatch(/8%|5%/);
  });
  it('old 8% / 5% commission copy is gone from the app', () => {
    for (const f of ['src/app/page.tsx', 'src/app/dashboard/earnings/page.tsx', 'src/lib/pricing.ts']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/8% delivery|5% collection|8% commission|5% commission/);
  });
  it('FeastQuarter Plus is off, and every public Plus surface is gated by the flag', () => {
    expect(DEFAULT_SETTINGS.feature_plus_enabled).toBe(false);
    expect(readFileSync('src/components/Header.tsx', 'utf8')).toMatch(/plus \? \[/);
    expect(readFileSync('src/app/page.tsx', 'utf8')).toMatch(/settings\.feature_plus_enabled && <section/);
    expect(readFileSync('src/app/plus/page.tsx', 'utf8')).toMatch(/coming soon/);
    expect(readFileSync('src/app/actions/customer.ts', 'utf8')).toMatch(/if \(!\(await plusEnabled\(\)\)\) redirect\('\/plus'\)/);
  });
  it('demonstration restaurants cannot take real orders in live mode', () => {
    const q = readFileSync('src/lib/services/quote.ts', 'utf8');
    expect(q).toMatch(/restaurant\.is_demo && !isDemo/);
    expect(readFileSync('src/lib/services/restaurants.ts', 'utf8')).toMatch(/isDemo \? all0 : all0\.filter\(\(r\) => !r\.is_demo\)/);
  });
  it('new restaurant applications start OFFLINE and unapproved', () => {
    const p = readFileSync('src/app/partner/page.tsx', 'utf8');
    expect(p).toMatch(/accepting_orders: false/);
    expect(p).toMatch(/status: 'pending'/);
  });
});

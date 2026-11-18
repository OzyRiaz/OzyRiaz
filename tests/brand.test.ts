import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND } from '@/lib/brand';
import { activeCities, launchCity, plannedCities } from '@/lib/cities';
import { emailHtml } from '@/lib/services/notify';

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const TEXT = /\.(tsx?|css|json|md|sql|svg|html|js|mts|toml|yml|example)$/;

describe('rebrand', () => {
  it('no old brand names remain in source, public assets, migrations or docs', () => {
    const files = ['src', 'public', 'supabase', 'netlify', 'tests'].flatMap((d) => walk(d)).concat(['README.md', 'package.json', '.env.example', 'netlify.toml']).filter((f) => TEXT.test(f) && !f.endsWith('brand.test.ts') && !f.endsWith('0003_rebrand.sql'));
    // Documented exception: internal browser storage keys (bdfeast.*) are retained for compatibility with existing customers' saved baskets.
    const strip = (t: string) => t.replace(/bdfeast\.(basket\.v1|postcode|\*)/g, '');
    const bad = files.filter((f) => /BD Feast|BDFeast|Bradford Food Pass|Bradford at your table/i.test(strip(readFileSync(f, 'utf8'))));
    expect(bad).toEqual([]);
  });
  it('brand constants', () => {
    expect(BRAND.name).toBe('FeastQuarter');
    expect(BRAND.plusName).toBe('FeastQuarter Plus');
    expect(BRAND.tagline).toBe('Your City. Your Food. Your Way.');
    expect(BRAND.colors).toMatchObject({ navy: '#132C39', gold: '#F4C870', ivory: '#FAF8F4' });
  });
  it('cities are configuration: Bradford live, Leeds and Manchester planned, brand not tied to a city', () => {
    expect(activeCities().map((c) => c.slug)).toEqual(['bradford']);
    expect(plannedCities().map((c) => c.slug)).toEqual(['leeds', 'manchester']);
    expect(launchCity().slug).toBe('bradford');
    expect(BRAND.name.toLowerCase()).not.toContain('bradford');
  });
  it('emails are branded and escape content', () => {
    const h = emailHtml('Order <b>1</b>', 'Hi & welcome\n\nSecond paragraph');
    expect(h).toContain('FeastQuarter');
    expect(h).toContain('/brand/email-logo.png');
    expect(h).toContain('Order &lt;b&gt;1&lt;/b&gt;');
    expect(h).toContain('Hi &amp; welcome');
  });
  it('new order references use the FQ- prefix', async () => {
    const { freshDb, customer, karahi } = await import('./helpers');
    const { createOrder } = await import('@/lib/services/orders');
    await freshDb(); const { r, byName } = await karahi();
    const o = await createOrder({ user: await customer(), restaurantId: r.id, fulfilment: 'collection', idempotencyKey: 'brand-ref-1', lines: [{ itemId: byName('Garlic naan').id, qty: 6, optionChoiceIds: [] }] });
    expect(o.reference).toMatch(/^FQ-[A-Z2-9]{6}$/);
  });
});

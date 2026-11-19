import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { rateLimit, __resetRateLimits } from '@/lib/rate-limit';
import { sendSms, toE164 } from '@/lib/services/notify';
import { recoverDisputeFromRestaurant, DisputeError } from '@/lib/services/disputes';
import { getDb } from '@/lib/db';
import { createOrder, markOrderPaid } from '@/lib/services/orders';
import { processStripeEvent } from '@/lib/services/stripe-webhook';
import { __setStripeForTests } from '@/lib/stripe';
import { customer, freshDb, karahi } from './helpers';
import type { Notification } from '@/lib/types';

vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '1.2.3.4' }), cookies: async () => ({ get: () => undefined }) }));
beforeEach(async () => { await freshDb(); __resetRateLimits(); __setStripeForTests(null); delete process.env.STRIPE_SECRET_KEY; delete process.env.SMS_BACKUP_ENABLED; });

describe('rate limiting', () => {
  it('allows up to the limit, then blocks until the window resets', () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rateLimit('k', 5, 60_000, t + i).ok).toBe(true);
    const blocked = rateLimit('k', 5, 60_000, t + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(rateLimit('k', 5, 60_000, t + 61_000).ok).toBe(true);
    expect(rateLimit('other', 5, 60_000, t).ok).toBe(true); // independent keys
  });
});

describe('SMS backup is OFF unless enabled and configured (never claims delivery otherwise)', () => {
  it('normalises UK numbers', () => {
    expect(toE164('07123 456789')).toBe('+447123456789');
    expect(toE164('+44 7123 456789')).toBe('+447123456789');
    expect(toE164('0044 7123 456789')).toBe('+447123456789');
    expect(toE164('12345')).toBeNull();
    expect(toE164(null)).toBeNull();
  });
  it('records "skipped" when not enabled and makes no network call', async () => {
    const f = vi.fn(); const orig = globalThis.fetch; globalThis.fetch = f as unknown as typeof fetch;
    try { expect(await sendSms('test', '07123456789', 'hi')).toBe('skipped'); expect(f).not.toHaveBeenCalled(); } finally { globalThis.fetch = orig; }
    expect((await (await getDb()).select<Notification>('notifications')).find((n) => n.kind === 'test_sms')!.status).toBe('skipped');
  });
  it('sends via Twilio only when explicitly enabled + configured (fetch mocked — not a live verification)', async () => {
    process.env.SMS_BACKUP_ENABLED = 'true'; process.env.TWILIO_ACCOUNT_SID = 'ACtest'; process.env.TWILIO_AUTH_TOKEN = 'tok'; process.env.TWILIO_FROM = '+15005550006';
    const f = vi.fn().mockResolvedValue(new Response('{}', { status: 201 })); const orig = globalThis.fetch; globalThis.fetch = f as unknown as typeof fetch;
    try { expect(await sendSms('test', '07123456789', 'hi')).toBe('sent'); expect(String(f.mock.calls[0][0])).toContain('api.twilio.com'); } finally { globalThis.fetch = orig; delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_FROM; }
  });
});

describe('dispute handling', () => {
  async function disputed() {
    const { r, byName } = await karahi();
    const o = await createOrder({ user: await customer(), restaurantId: r.id, fulfilment: 'collection', idempotencyKey: crypto.randomUUID(), lines: [{ itemId: byName('Garlic naan').id, qty: 10, optionChoiceIds: [] }] });
    await markOrderPaid(o.id, { amountPence: o.total_pence, paymentIntentId: 'pi_disp', source: 'stripe' });
    await processStripeEvent({ id: 'evt_d', type: 'charge.dispute.created', data: { object: { id: 'dp_1', payment_intent: 'pi_disp', amount: o.total_pence, reason: 'fraudulent', status: 'needs_response' } } } as never);
    return (await (await getDb()).get<any>('orders', { id: o.id }))!;
  }
  it('a dispute marks the order disputed and logs an open dispute transaction', async () => {
    const o = await disputed();
    expect(o.payment_status).toBe('disputed');
    expect(await (await getDb()).select('transactions', { order_id: o.id, kind: 'dispute', status: 'open' })).toHaveLength(1);
  });
  it('recovery reverses the restaurant transfer (capped at its allocation); it is never automatic', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock0000000000000000';
    const createReversal = vi.fn().mockResolvedValue({ id: 'trr_1' });
    __setStripeForTests({ paymentIntents: { retrieve: vi.fn().mockResolvedValue({ latest_charge: { transfer: 'tr_1' } }) }, transfers: { createReversal } });
    const o = await disputed();
    expect(createReversal).not.toHaveBeenCalled(); // the dispute alone did nothing
    await expect(recoverDisputeFromRestaurant(o.id, o.restaurant_net_pence + 1, 'admin')).rejects.toThrow(DisputeError);
    expect(await recoverDisputeFromRestaurant(o.id, 1000, 'admin')).toBe('trr_1');
    expect(createReversal).toHaveBeenCalledWith('tr_1', expect.objectContaining({ amount: 1000 }), expect.objectContaining({ idempotencyKey: expect.any(String) }));
  });
});

describe('secrets and access boundaries (static checks)', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  it('server-only secrets are never referenced from client components', () => {
    const clients = walk('src').filter((f) => /\.(tsx?)$/.test(f) && /^['"]use client['"]/.test(readFileSync(f, 'utf8').trimStart()));
    expect(clients.length).toBeGreaterThan(5);
    for (const f of clients) expect(readFileSync(f, 'utf8'), f).not.toMatch(/SERVICE_ROLE|STRIPE_SECRET|STRIPE_WEBHOOK|CRON_SECRET|RESEND_API_KEY|TWILIO_AUTH/);
  });
  it('no NEXT_PUBLIC_ variable carries a secret', () => {
    const env = readFileSync('.env.example', 'utf8');
    expect(env).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE_ROLE|PRIVATE)/);
  });
  it('every admin page and action is behind the admin role guard', () => {
    for (const f of walk('src/app/admin').filter((x) => x.endsWith('layout.tsx'))) expect(readFileSync(f, 'utf8')).toMatch(/requireRole\('admin'/);
    expect(readFileSync('src/app/admin/actions.ts', 'utf8')).toMatch(/requireRole\('admin'/);
    expect(readFileSync('src/app/api/admin/export/[kind]/route.ts', 'utf8')).toMatch(/role !== 'admin'/);
  });
  it('cron endpoints require a long CRON_SECRET and use constant-time comparison', () => {
    for (const f of ['src/app/api/cron/daily-summary/route.ts', 'src/app/api/cron/order-timeouts/route.ts']) { const s = readFileSync(f, 'utf8'); expect(s).toMatch(/timingSafeEqual/); expect(s).toMatch(/length < 16/); }
  });
  it('the Stripe webhook verifies signatures against the raw body before doing anything', () => {
    const s = readFileSync('src/app/api/stripe/webhook/route.ts', 'utf8');
    expect(s).toMatch(/constructEvent\(raw, sig, secret\)/);
    expect(s.indexOf('constructEvent(')).toBeLessThan(s.indexOf('await processStripeEvent('));
  });
  it('the order success page never marks anything paid', () => {
    expect(readFileSync('src/app/checkout/success/page.tsx', 'utf8')).not.toMatch(/markOrderPaid/);
  });
});

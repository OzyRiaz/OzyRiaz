import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/lib/db';
import { createOrder, markOrderPaid, updateOrderStatus, cancelOrderByCustomer } from '@/lib/services/orders';
import { processUnansweredOrders } from '@/lib/services/operations';
import { __setPushSenderForTests, hasSubscription, pushConfigured, removeSubscription, saveSubscription, sendPushToRestaurant, sendPushToUser, type PushSub } from '@/lib/services/push';
import { customer, freshDb, karahi, owner, owner2 } from './helpers';

const sub = (n: string) => ({ endpoint: `https://push.example.com/${n}`, keys: { p256dh: 'p'.repeat(30) + n, auth: 'a'.repeat(12) + n } });
const sent: { endpoint: string; body: { title: string; body: string; url: string } }[] = [];
const fake = vi.fn(async (s: { endpoint: string }, payload: string) => { sent.push({ endpoint: s.endpoint, body: JSON.parse(payload) }); });

beforeEach(async () => {
  await freshDb(); sent.length = 0; fake.mockClear();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BPublicKeyForTests'; process.env.VAPID_PRIVATE_KEY = 'privateForTests'; process.env.VAPID_SUBJECT = 'mailto:test@example.com';
  __setPushSenderForTests(fake as never);
});
afterEach(() => { __setPushSenderForTests(null); delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; delete process.env.VAPID_SUBJECT; });

async function paidOrder() {
  const { r, byName } = await karahi(); const user = await customer();
  const o = await createOrder({ user, restaurantId: r.id, fulfilment: 'delivery', idempotencyKey: crypto.randomUUID(), address: { line1: '1 Test St', city: 'Bradford', postcode: 'BD5 0AA' }, lines: [{ itemId: byName('Garlic naan').id, qty: 6, optionChoiceIds: [] }] });
  return { o, r, user };
}

describe('push: configuration and subscriptions', () => {
  it('is off unless all three settings exist', () => {
    expect(pushConfigured()).toBe(true);
    delete process.env.VAPID_PRIVATE_KEY; expect(pushConfigured()).toBe(false);
    process.env.VAPID_PRIVATE_KEY = 'x'; process.env.VAPID_SUBJECT = 'not-a-url'; expect(pushConfigured()).toBe(false);
  });
  it('sends nothing when not configured', async () => {
    delete process.env.VAPID_PRIVATE_KEY; const c = await customer(); await saveSubscription(c.userId, sub('1'));
    expect(await sendPushToUser(c.userId, { title: 't', body: 'b', url: '/' })).toBe(0); expect(fake).not.toHaveBeenCalled();
  });
  it('same device re-subscribing keeps one row and moves to the new user; remove only works on your own', async () => {
    const c = await customer(); const ow = await owner(); const db = await getDb();
    const id1 = await saveSubscription(c.userId, sub('2')); const id2 = await saveSubscription(ow.userId, sub('2'));
    expect(id2).toBe(id1); expect(await db.select<PushSub>('push_subscriptions')).toHaveLength(1);
    expect(await hasSubscription(c.userId)).toBe(false); expect(await hasSubscription(ow.userId)).toBe(true);
    await removeSubscription(c.userId, { id: id1 }); expect(await hasSubscription(ow.userId)).toBe(true); // not theirs, untouched
    await removeSubscription(ow.userId, { id: id1 }); expect(await hasSubscription(ow.userId)).toBe(false);
  });
  it('removes dead devices (410) and never throws', async () => {
    const c = await customer(); await saveSubscription(c.userId, sub('3'));
    const dead = vi.fn(async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); });
    await expect(sendPushToUser(c.userId, { title: 't', body: 'b', url: '/' }, dead as never)).resolves.toBe(0);
    expect(await hasSubscription(c.userId)).toBe(false);
  });
  it('keeps a device through a one-off failure but drops it after 5', async () => {
    const c = await customer(); await saveSubscription(c.userId, sub('4')); const db = await getDb();
    const bad = vi.fn(async () => { throw new Error('network'); });
    for (let i = 0; i < 4; i++) await sendPushToUser(c.userId, { title: 't', body: 'b', url: '/' }, bad as never);
    expect((await db.select<PushSub>('push_subscriptions'))[0].failure_count).toBe(4);
    await sendPushToUser(c.userId, { title: 't', body: 'b', url: '/' }, bad as never); expect(await hasSubscription(c.userId)).toBe(false);
  });
});

describe('push: order events', () => {
  it('new paid order alerts the restaurant staff only', async () => {
    const { o, r } = await paidOrder(); const ow = await owner(); const ow2 = await owner2(); const c = await customer();
    await saveSubscription(ow.userId, sub('10')); await saveSubscription(ow2.userId, sub('11')); await saveSubscription(c.userId, sub('12'));
    await markOrderPaid(o.id, { amountPence: o.total_pence, paymentIntentId: 'pi_push_1', source: 'stripe' });
    expect(sent.map((s) => s.endpoint)).toEqual(['https://push.example.com/10']); // other restaurant and the customer get nothing
    expect(sent[0].body.url).toBe('/dashboard'); expect(sent[0].body.title).toBe('New order'); expect(r.id).toBeTruthy();
  });
  it('customer is told at each step; payload holds no email, address or card info', async () => {
    const { o } = await paidOrder(); const ow = await owner(); const c = await customer();
    await markOrderPaid(o.id, { amountPence: o.total_pence, paymentIntentId: 'pi_push_2', source: 'stripe' });
    await saveSubscription(c.userId, sub('20')); sent.length = 0;
    for (const s of ['accepted', 'preparing', 'ready', 'out_for_delivery', 'completed'] as const) await updateOrderStatus(o.id, s, ow);
    expect(sent).toHaveLength(5); expect(sent.every((s) => s.body.url === `/orders/${o.id}`)).toBe(true);
    const all = JSON.stringify(sent); expect(all).not.toMatch(/@|1 Test St|BD5|4242/);
  });
  it('a failing push service never breaks the order', async () => {
    const { o } = await paidOrder(); const ow = await owner(); const c = await customer();
    await saveSubscription(c.userId, sub('30')); __setPushSenderForTests((async () => { throw new Error('push down'); }) as never);
    await markOrderPaid(o.id, { amountPence: o.total_pence, paymentIntentId: 'pi_push_3', source: 'stripe' });
    expect((await updateOrderStatus(o.id, 'accepted', ow)).status).toBe('accepted');
  });
  it('restaurant is told when the customer cancels, reminded when slow; customer told on timeout', async () => {
    const { o } = await paidOrder(); const ow = await owner(); const c = await customer();
    await saveSubscription(ow.userId, sub('40')); await saveSubscription(c.userId, sub('41'));
    await markOrderPaid(o.id, { amountPence: o.total_pence, paymentIntentId: 'pi_push_4', source: 'stripe' }); sent.length = 0;
    const later = new Date(Date.now() + 6 * 60_000); await processUnansweredOrders(later);
    expect(sent.some((s) => s.endpoint.endsWith('/40') && /waiting/i.test(s.body.title))).toBe(true);
    sent.length = 0; await processUnansweredOrders(new Date(Date.now() + 30 * 60_000));
    expect(sent.some((s) => s.endpoint.endsWith('/41') && /refunded/.test(s.body.body))).toBe(true);
  });
  it('cancel by customer alerts the restaurant', async () => {
    const { o } = await paidOrder(); const ow = await owner(); const c = await customer(); await saveSubscription(ow.userId, sub('50'));
    await markOrderPaid(o.id, { amountPence: o.total_pence, paymentIntentId: 'pi_push_5', source: 'stripe' }); sent.length = 0;
    await cancelOrderByCustomer(o.id, c.userId);
    expect(sent.some((s) => s.body.title === 'Order cancelled')).toBe(true);
  });
});

describe('push: static checks', () => {
  it('subscribe route needs a session, takes the user from it, and only https endpoints', () => {
    const r = readFileSync('src/app/api/push/subscribe/route.ts', 'utf8');
    expect(r).toMatch(/getSession\(\)/); expect(r).toMatch(/startsWith\('https:\/\/'\)/); expect(r).not.toMatch(/body\.user|userId:\s*p\.data/);
  });
  it('private key never reaches browser code; service worker links stay on-site; nothing asks for permission on page load', () => {
    expect(readFileSync('src/components/PushToggle.tsx', 'utf8')).not.toMatch(/VAPID_PRIVATE/);
    expect(readFileSync('.env.example', 'utf8')).not.toMatch(/NEXT_PUBLIC_VAPID_PRIVATE/);
    const sw = readFileSync('public/sw.js', 'utf8'); expect(sw).toMatch(/startsWith\('\/'\)/);
    const t = readFileSync('src/components/PushToggle.tsx', 'utf8'); const i = t.indexOf('requestPermission'); expect(t.slice(0, i)).toMatch(/async function enable/); // only inside the tap handler
  });
});

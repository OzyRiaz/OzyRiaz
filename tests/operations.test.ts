import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { createOrder, markOrderPaid, updateOrderStatus, OrderError } from '@/lib/services/orders';
import { processUnansweredOrders, setOnline, OperationsError } from '@/lib/services/operations';
import { buildQuote } from '@/lib/services/quote';
import { customer, freshDb, karahi, owner, owner2 } from './helpers';
import { labelFor } from '@/lib/order-state';
import type { Notification, Order, Restaurant } from '@/lib/types';

async function paid(fulfilment: 'delivery' | 'collection' = 'delivery') {
  const { r, byName } = await karahi();
  const o = await createOrder({ user: await customer(), restaurantId: r.id, fulfilment, idempotencyKey: crypto.randomUUID(), address: { line1: '1 Test St', city: 'Bradford', postcode: 'BD5 0AA' }, lines: [{ itemId: byName('Garlic naan').id, qty: 6, optionChoiceIds: [] }] });
  await markOrderPaid(o.id, { amountPence: o.total_pence, paymentIntentId: 'pi_demo_ops_' + o.id.slice(0, 6), source: 'stripe' });
  return { r, order: (await (await getDb()).get<Order>('orders', { id: o.id }))! };
}
beforeEach(async () => { await freshDb(); });

describe('order operations', () => {
  it('records the chosen preparation time on acceptance and validates it', async () => {
    const { order } = await paid(); const me = await owner();
    await expect(updateOrderStatus(order.id, 'accepted', me, { readyInMinutes: 2 })).rejects.toThrow(/between 5 and 180/);
    const u = await updateOrderStatus(order.id, 'accepted', me, { readyInMinutes: 25 });
    expect(u.ready_in_minutes).toBe(25);
    expect(u.accepted_at).toBeTruthy();
    const mail = (await (await getDb()).select<Notification>('notifications')).find((n) => n.kind === 'order_accepted')!;
    expect(mail.body).toMatch(/about 25 minutes/);
  });
  it('prevents duplicate acceptance (second concurrent accept loses)', async () => {
    const { order } = await paid(); const me = await owner();
    const results = await Promise.allSettled([updateOrderStatus(order.id, 'accepted', me), updateOrderStatus(order.id, 'accepted', me)]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((x) => x.status === 'rejected')).toHaveLength(1);
    const db = await getDb();
    expect((await db.get<Order>('orders', { id: order.id }))!.history.filter((h) => h.status === 'accepted')).toHaveLength(1);
  });
  it('another restaurant cannot accept, reject or read this order', async () => {
    const { order } = await paid();
    await expect(updateOrderStatus(order.id, 'accepted', await owner2())).rejects.toThrow(/access/);
    await expect(updateOrderStatus(order.id, 'rejected', await owner2(), { reason: 'no' })).rejects.toThrow(OrderError);
  });
  it('collection orders end as Ready for collection → Collected; delivery as Delivered', async () => {
    expect(labelFor('ready', 'collection')).toBe('Ready for collection');
    expect(labelFor('completed', 'collection')).toBe('Collected');
    expect(labelFor('completed', 'delivery')).toBe('Delivered');
    const { order } = await paid('collection'); const me = await owner();
    for (const s of ['accepted', 'preparing', 'ready'] as const) await updateOrderStatus(order.id, s, me);
    const mail = (await (await getDb()).select<Notification>('notifications')).find((n) => n.kind === 'order_ready')!;
    expect(mail.body).toMatch(/ready for collection/);
    await updateOrderStatus(order.id, 'completed', me);
  });
});

describe('online / offline control', () => {
  it('offline restaurants cannot take new orders; going online needs approval and Stripe readiness', async () => {
    const { r, byName } = await karahi();
    const line = [{ itemId: byName('Garlic naan').id, qty: 6, optionChoiceIds: [] }];
    await setOnline(r.id, false);
    await expect(buildQuote({ restaurantId: r.id, lines: line, fulfilment: 'collection' })).rejects.toThrow(/offline/);
    await setOnline(r.id, true);
    await expect(buildQuote({ restaurantId: r.id, lines: line, fulfilment: 'collection' })).resolves.toBeTruthy();
    const db = await getDb();
    const pending = (await db.get<Restaurant>('restaurants', { slug: 'green-bowl-demo' }))!;
    await expect(setOnline(pending.id, true)).rejects.toThrow(OperationsError);
  });
  it('paid orders already in progress can still be handled while offline', async () => {
    const { r, order } = await paid();
    await setOnline(r.id, false);
    await expect(updateOrderStatus(order.id, 'accepted', await owner())).resolves.toBeTruthy();
  });
});

describe('unanswered-order timeout and escalation', () => {
  const at = (o: Order, min: number) => new Date(new Date(o.paid_at!).getTime() + min * 60000);
  it('does nothing before the escalation window', async () => {
    const { order } = await paid();
    expect(await processUnansweredOrders(at(order, 2))).toEqual({ escalated: 0, autoDeclined: 0 });
  });
  it('escalates once (reminder + admin alert), never repeatedly', async () => {
    const { order } = await paid();
    expect(await processUnansweredOrders(at(order, 6))).toEqual({ escalated: 1, autoDeclined: 0 });
    expect(await processUnansweredOrders(at(order, 8))).toEqual({ escalated: 0, autoDeclined: 0 });
    const kinds = (await (await getDb()).select<Notification>('notifications')).map((n) => n.kind);
    expect(kinds.filter((k) => k === 'order_reminder')).toHaveLength(1);
  });
  it('after the timeout: declines, refunds in full, tells the customer, and takes the restaurant offline', async () => {
    const { r, order } = await paid();
    expect(await processUnansweredOrders(at(order, 13))).toEqual({ escalated: 0, autoDeclined: 1 });
    const db = await getDb();
    const after = (await db.get<Order>('orders', { id: order.id }))!;
    expect(after.status).toBe('rejected');
    expect(after.payment_status).toBe('refunded');
    expect(after.refunded_pence).toBe(order.total_pence);
    expect((await db.get<Restaurant>('restaurants', { id: r.id }))!.accepting_orders).toBe(false);
    const kinds = (await db.select<Notification>('notifications')).map((n) => n.kind);
    expect(kinds).toContain('order_timeout_customer');
    expect(await processUnansweredOrders(at(order, 20))).toEqual({ escalated: 0, autoDeclined: 0 }); // idempotent
  });
  it('an order accepted in time is never auto-declined', async () => {
    const { order } = await paid();
    await updateOrderStatus(order.id, 'accepted', await owner());
    expect(await processUnansweredOrders(at(order, 30))).toEqual({ escalated: 0, autoDeclined: 0 });
  });
});

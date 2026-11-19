import { appUrl } from '../config';
import { getDb } from '../db';
import { fmt } from '../money';
import type { Order, Profile, Restaurant } from '../types';
import { notify, sendSms } from './notify';
import { refundOrder } from './orders';

export class OperationsError extends Error {}

/** Minutes before a paid, unanswered order triggers a reminder + admin escalation, and before it is auto-declined and refunded. */
export const escalateAfterMin = () => Number(process.env.ORDER_ESCALATE_MINUTES ?? 5);
export const timeoutAfterMin = () => Number(process.env.ORDER_TIMEOUT_MINUTES ?? 12);

export async function setOnline(restaurantId: string, online: boolean) {
  const db = await getDb();
  const r = await db.get<Restaurant>('restaurants', { id: restaurantId });
  if (!r) throw new OperationsError('Restaurant not found');
  if (online && r.status !== 'approved') throw new OperationsError('Your restaurant must be approved before it can go online');
  if (online && !r.stripe_charges_enabled) throw new OperationsError('Finish Stripe payment setup before going online');
  await db.update('restaurants', { id: restaurantId }, { accepting_orders: online });
}

/**
 * Unanswered-order handling (run every few minutes by cron):
 *  1. After ESCALATE minutes: remind the restaurant and alert the admin once (escalated_at guards against repeats).
 *  2. After TIMEOUT minutes: decline on the restaurant's behalf, refund in FULL, tell the customer, take the restaurant offline
 *     (so no further customers are affected) and alert the admin. Each step is idempotent.
 * Notification failures are recorded as failed/skipped in the outbox, which is why the admin is always alerted as a second channel.
 */
export async function processUnansweredOrders(now = new Date()) {
  const db = await getDb();
  const waiting = await db.select<Order>('orders', { status: 'awaiting_restaurant', payment_status: 'paid' });
  const out = { escalated: 0, autoDeclined: 0 };
  for (const o of waiting) {
    const ageMin = (now.getTime() - new Date(o.paid_at ?? o.created_at).getTime()) / 60000;
    const r = (await db.get<Restaurant>('restaurants', { id: o.restaurant_id }))!;
    if (ageMin >= timeoutAfterMin()) {
      const reason = 'The restaurant did not respond in time';
      const [claimed] = await db.update<Order>('orders', { id: o.id, status: 'awaiting_restaurant' }, { status: 'rejected', rejection_reason: reason, history: [...o.history, { status: 'rejected', at: now.toISOString(), by: 'system:timeout' }] });
      if (!claimed) continue; // someone answered at the last moment
      await refundOrder(o.id, o.total_pence - o.refunded_pence, reason, null, { kind: 'timeout' });
      if (process.env.ORDER_TIMEOUT_GOES_OFFLINE !== 'false') await db.update('restaurants', { id: r.id }, { accepting_orders: false });
      const c = await db.get<Profile>('profiles', { id: o.customer_id });
      await notify({ kind: 'order_timeout_customer', to: c?.email, subject: `Order ${o.reference} could not be accepted`, body: `Sorry — ${r.name} didn't respond in time, so your order was cancelled and you've been refunded ${fmt(o.total_pence)} in full. Please try another restaurant.` });
      await notify({ kind: 'order_timeout_restaurant', to: r.email, subject: `Order ${o.reference} expired — you've been set offline`, body: `An order was not accepted within ${timeoutAfterMin()} minutes, so it was declined and refunded. Your restaurant has been set to Offline. Open your dashboard and go Online when you're ready: ${appUrl()}/dashboard` });
      await notify({ kind: 'order_timeout_admin', to: process.env.ADMIN_NOTIFY_EMAIL, subject: `Order ${o.reference} auto-declined (${r.name})`, body: `Unanswered for ${Math.round(ageMin)} min; refunded in full; restaurant set offline.` });
      out.autoDeclined++;
    } else if (ageMin >= escalateAfterMin() && !o.escalated_at) {
      await db.update('orders', { id: o.id }, { escalated_at: now.toISOString() });
      await sendSms('order_reminder', r.phone, `FeastQuarter URGENT: order ${o.reference} is waiting ${Math.round(ageMin)} min. Accept or decline in your dashboard.`);
      await notify({ kind: 'order_reminder', to: r.email, subject: `ACTION NEEDED: order ${o.reference} is waiting`, body: `A paid ${o.fulfilment} order for ${fmt(o.total_pence)} has been waiting ${Math.round(ageMin)} minutes. Accept or decline it now: ${appUrl()}/dashboard. It will be auto-declined and refunded after ${timeoutAfterMin()} minutes.` });
      await notify({ kind: 'order_escalation_admin', to: process.env.ADMIN_NOTIFY_EMAIL, subject: `Escalation: ${r.name} has not answered order ${o.reference}`, body: `Waiting ${Math.round(ageMin)} min. Phone the restaurant: ${r.phone ?? 'no phone on file'}.` });
      out.escalated++;
    }
  }
  return out;
}

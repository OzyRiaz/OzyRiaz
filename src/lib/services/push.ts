import { sendNotification } from 'web-push';
import { getDb } from '../db';
import type { RestaurantStaff } from '../types';

export interface PushSub { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; failure_count: number }
export interface PushPayload { title: string; body: string; url: string; tag?: string }
export type PushSender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;

export const vapidPublicKey = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
/** Push is only active when all three settings are present. Without them the whole feature stays hidden and silent. */
export const pushConfigured = () => !!(vapidPublicKey() && process.env.VAPID_PRIVATE_KEY && /^(mailto:|https:\/\/)/.test(process.env.VAPID_SUBJECT ?? ''));

const defaultSender: PushSender = (sub, payload) =>
  sendNotification(sub, payload, { vapidDetails: { subject: process.env.VAPID_SUBJECT!, publicKey: vapidPublicKey(), privateKey: process.env.VAPID_PRIVATE_KEY! }, TTL: 3600, urgency: 'high' });

let senderOverride: PushSender | null = null;
/** Tests only: replaces the real network sender so no test ever contacts a push service. */
export const __setPushSenderForTests = (f: PushSender | null) => { senderOverride = f; };

export interface SubscriptionInput { endpoint: string; keys: { p256dh: string; auth: string } }

/** A device that said yes. If this browser was previously used by someone else, it now belongs to the current user. */
export async function saveSubscription(userId: string, s: SubscriptionInput, userAgent?: string | null): Promise<string> {
  const db = await getDb();
  const existing = await db.get<PushSub>('push_subscriptions', { endpoint: s.endpoint });
  if (existing) {
    await db.update('push_subscriptions', { id: existing.id }, { user_id: userId, p256dh: s.keys.p256dh, auth: s.keys.auth, failure_count: 0 });
    return existing.id;
  }
  const row = await db.insert<PushSub>('push_subscriptions', { user_id: userId, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, user_agent: (userAgent ?? '').slice(0, 200), last_success_at: null, failure_count: 0 });
  return row.id;
}

export async function removeSubscription(userId: string, where: { id?: string; endpoint?: string }) {
  const db = await getDb();
  const row = await db.get<PushSub>('push_subscriptions', where.id ? { id: where.id } : { endpoint: where.endpoint });
  if (row && row.user_id === userId) await db.delete('push_subscriptions', { id: row.id }); // only ever your own device
}

export async function hasSubscription(userId: string): Promise<boolean> {
  return (await (await getDb()).select<PushSub>('push_subscriptions', { user_id: userId }, { limit: 1 })).length > 0;
}

/**
 * Sends to every device of one user. NEVER throws: a notification problem must not break an order.
 * Dead devices (404/410) are removed; repeated failures are removed after 5.
 */
export async function sendPushToUser(userId: string | null | undefined, payload: PushPayload, send?: PushSender): Promise<number> {
  const sender = send ?? senderOverride ?? defaultSender;
  if (!userId || !pushConfigured()) return 0;
  let sent = 0;
  try {
    const db = await getDb();
    const subs = await db.select<PushSub>('push_subscriptions', { user_id: userId });
    const body = JSON.stringify({ title: payload.title.slice(0, 80), body: payload.body.slice(0, 160), url: payload.url, tag: payload.tag });
    await Promise.all(subs.map(async (s) => {
      try {
        await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
        await db.update('push_subscriptions', { id: s.id }, { last_success_at: new Date().toISOString(), failure_count: 0 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410 || s.failure_count + 1 >= 5) await db.delete('push_subscriptions', { id: s.id });
        else await db.update('push_subscriptions', { id: s.id }, { failure_count: s.failure_count + 1 });
      }
    }));
  } catch { /* swallow: notifications are best-effort */ }
  return sent;
}

export async function sendPushToRestaurant(restaurantId: string, payload: PushPayload, send?: PushSender): Promise<number> {
  if (!pushConfigured()) return 0;
  try {
    const staff = await (await getDb()).select<RestaurantStaff>('restaurant_staff', { restaurant_id: restaurantId });
    const counts = await Promise.all(staff.map((m) => sendPushToUser(m.user_id, payload, send)));
    return counts.reduce((a, b) => a + b, 0);
  } catch { return 0; }
}

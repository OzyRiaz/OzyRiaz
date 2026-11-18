import { emailConfigured } from '../config';
import { getDb } from '../db';
import type { Notification } from '../types';

/**
 * Notification adapter. Every message is recorded in `notifications` (the outbox).
 * - If RESEND_API_KEY is set, email is attempted via Resend and the result recorded (sent/failed).
 * - Otherwise status is 'skipped': NOTHING was delivered. The admin outbox view shows this honestly.
 * SMS/push are not implemented.
 */
export async function notify(n: { kind: string; to: string | null | undefined; subject: string; body: string }): Promise<Notification | null> {
  if (!n.to) return null;
  const db = await getDb();
  const rec = await db.insert<Notification>('notifications', { kind: n.kind, to_email: n.to, subject: n.subject, body: n.body, status: 'queued', detail: null });
  if (!emailConfigured()) {
    const [u] = await db.update<Notification>('notifications', { id: rec.id }, { status: 'skipped', detail: 'Email provider not configured (RESEND_API_KEY empty)' });
    return u;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [n.to], subject: n.subject, text: n.body }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const [u] = await db.update<Notification>('notifications', { id: rec.id }, { status: 'sent', detail: null });
    return u;
  } catch (e) {
    const [u] = await db.update<Notification>('notifications', { id: rec.id }, { status: 'failed', detail: String((e as Error).message).slice(0, 300) });
    return u;
  }
}

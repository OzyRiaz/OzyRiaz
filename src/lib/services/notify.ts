import { appUrl, emailConfigured } from '../config';
import { BRAND } from '../brand';
import { getDb } from '../db';
import type { Notification } from '../types';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Branded HTML email (table layout, inline styles for mail-client compatibility). The logo is served from /brand/email-logo.png. */
export function emailHtml(subject: string, body: string): string {
  const paras = body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.55">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const c = BRAND.colors;
  return `<!doctype html><html lang="en-GB"><body style="margin:0;background:${c.ivory};font-family:Arial,Helvetica,sans-serif;color:${c.charcoal}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:${c.white};border-radius:14px;overflow:hidden">
<tr><td style="background:${c.navy};padding:18px 24px"><img src="${appUrl()}/brand/email-logo.png" width="240" height="52" alt="${BRAND.name}" style="display:block;border:0"></td></tr>
<tr><td style="padding:26px 24px 8px"><h1 style="margin:0 0 16px;font-size:20px;color:${c.navy}">${esc(subject)}</h1>${paras}</td></tr>
<tr><td style="padding:16px 24px 24px;border-top:1px solid #eee;font-size:12px;color:#6b7780">${BRAND.name} — ${BRAND.tagline}<br>Questions? ${BRAND.supportEmail}</td></tr>
</table></td></tr></table></body></html>`;
}

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
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [n.to], subject: n.subject, text: `${n.body}\n\n${BRAND.name} — ${BRAND.tagline}`, html: emailHtml(n.subject, n.body) }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const [u] = await db.update<Notification>('notifications', { id: rec.id }, { status: 'sent', detail: null });
    return u;
  } catch (e) {
    const [u] = await db.update<Notification>('notifications', { id: rec.id }, { status: 'failed', detail: String((e as Error).message).slice(0, 300) });
    return u;
  }
}

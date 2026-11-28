import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { pushConfigured, removeSubscription, saveSubscription } from '@/lib/services/push';

export const runtime = 'nodejs';
const DEVICE_COOKIE = 'fq_push_device';
const Sub = z.object({ endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'must be https'), keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }) });

/** Turn notifications ON for this device. The user always comes from the session, never from the request body. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: 'Notifications are not switched on yet.' }, { status: 503 });
  if (!rateLimit(`push:${s.userId}`, 20, 60 * 60_000).ok) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  const p = Sub.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'That notification address was not valid.' }, { status: 400 });
  const id = await saveSubscription(s.userId, p.data, req.headers.get('user-agent'));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEVICE_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: (process.env.NEXT_PUBLIC_APP_URL ?? '').startsWith('https://'), path: '/', maxAge: 365 * 86400 });
  return res;
}

/** Turn notifications OFF for this device (only ever your own). */
export async function DELETE(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : undefined;
  if (endpoint) await removeSubscription(s.userId, { endpoint });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(DEVICE_COOKIE);
  return res;
}

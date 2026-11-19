import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { processUnansweredOrders } from '@/lib/services/operations';

export const dynamic = 'force-dynamic';
const authorised = (req: Request) => {
  const secret = process.env.CRON_SECRET; const given = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};
/** Escalates and auto-declines unanswered paid orders. Called every 5 minutes by netlify/functions/order-timeouts.mts. */
export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  return NextResponse.json(await processUnansweredOrders());
}

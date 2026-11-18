import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { fmt } from '@/lib/money';
import { notify } from '@/lib/services/notify';
import { dailySummary } from '@/lib/services/reports';

export const dynamic = 'force-dynamic';

const authorised = (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Daily admin sales summary. Triggered by the Netlify scheduled function (see netlify/functions/daily-summary.mts). */
export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  // Summarise the previous UTC day (the schedule runs in the morning).
  const s = await dailySummary(new Date(Date.now() - 864e5));
  const body = [`BD Feast daily summary — ${s.date}`, '', `Paid orders: ${s.paid_orders}`, `GMV (gross order value): ${fmt(s.gmv_pence)}`, `Commission revenue: ${fmt(s.commission_revenue_pence)}`, `Subscription revenue: ${fmt(s.subscription_revenue_pence)}`, `Platform revenue (commission + subscriptions): ${fmt(s.platform_revenue_pence)}`, `Refunds: ${fmt(s.refunded_pence)}`, `Failed payments: ${s.failed_payments}`, `Open disputes: ${s.open_disputes}`, `Restaurants awaiting approval: ${s.pending_restaurants}`].join('\n');
  const n = await notify({ kind: 'daily_summary', to: process.env.ADMIN_NOTIFY_EMAIL, subject: `BD Feast daily summary ${s.date}`, body });
  return NextResponse.json({ summary: s, email: n?.status ?? 'no ADMIN_NOTIFY_EMAIL set' });
}

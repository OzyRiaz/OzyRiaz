import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { fmt } from '@/lib/money';
import { notify } from '@/lib/services/notify';
import { breakdown, dailySummary } from '@/lib/services/reports';
import { reconcileStripeFees } from '@/lib/services/reconcile';
import { vatStatus } from '@/lib/services/vat';

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
  const recon = await reconcileStripeFees().catch(() => ({ checked: 0, recorded: 0, pending: 0, skipped: 0, failed: -1 }));
  const day = new Date(Date.now() - 864e5);
  const s = await dailySummary(day);
  const from = new Date(day); from.setUTCHours(0, 0, 0, 0);
  const b = await breakdown({ from, to: new Date(from.getTime() + 864e5 - 1) });
  const vat = await vatStatus();
  const body = [`FeastQuarter daily summary — ${s.date}`, '', `Paid orders: ${s.paid_orders}`, `GMV (gross order value): ${fmt(s.gmv_pence)}`, `Commission revenue: ${fmt(s.commission_revenue_pence)}`, `Subscription revenue: ${fmt(s.subscription_revenue_pence)}`, `Platform taxable revenue (commission + subscriptions): ${fmt(s.platform_revenue_pence)}`, `Refunds: ${fmt(s.refunded_pence)}`, `Failed payments: ${s.failed_payments}`, `Open disputes: ${s.open_disputes}`, `Stripe processing (actual ${fmt(b.processing_fees_actual_pence)}, estimated ${fmt(b.processing_fees_estimated_pence)})`, `Net contribution: ${fmt(b.net_contribution_pence)}`, `Restaurants awaiting approval: ${s.pending_restaurants}`, `Stripe fee reconcile: ${recon.recorded} recorded, ${recon.pending} pending, ${recon.failed} failed`, `VAT threshold: ${(vat.pct * 100).toFixed(0)}% used (${fmt(vat.income_pence)} of ${fmt(vat.threshold_pence)}) — ${vat.message}`].join('\n');
  const n = await notify({ kind: 'daily_summary', to: process.env.ADMIN_NOTIFY_EMAIL, subject: `FeastQuarter daily summary ${s.date}`, body });
  return NextResponse.json({ summary: s, vat: vat.level, reconcile: recon, email: n?.status ?? 'no ADMIN_NOTIFY_EMAIL set' });
}

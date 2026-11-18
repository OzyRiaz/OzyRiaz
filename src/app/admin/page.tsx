import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, Notice, Stat } from '@/components/ui';
import { getDb } from '@/lib/db';
import { fmt } from '@/lib/money';
import { platformStats } from '@/lib/services/reports';
import type { Restaurant } from '@/lib/types';
export const metadata: Metadata = { title: 'Admin overview' };
export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const [st, pending] = await Promise.all([platformStats(), (await getDb()).select<Restaurant>('restaurants', { status: 'pending' })]);
  return (
    <div className="space-y-6">
      {pending.length > 0 && <Notice tone="gold"><strong>{pending.length} restaurant application{pending.length === 1 ? '' : 's'} awaiting review.</strong> <Link href="/admin/restaurants" className="underline">Review now</Link></Notice>}
      <section aria-labelledby="gmv"><h2 id="gmv" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Marketplace volume — not BD Feast income</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Gross merchandise value" value={fmt(st.gmv_pence)} sub="Total paid by customers (before refunds). Mostly belongs to restaurants." /><Stat label="Paid orders" value={String(st.paid_orders)} /><Stat label="Refunded" value={fmt(st.refunded_pence)} /><Stat label="Active members" value={String(st.active_members)} sub="BD Feast Plus" /></div></section>
      <section aria-labelledby="rev"><h2 id="rev" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">BD Feast revenue</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3"><Stat tone="gold" label="Platform revenue" value={fmt(st.platform_revenue_pence)} sub="Commission + subscriptions" /><Stat label="Commission revenue" value={fmt(st.commission_revenue_pence)} sub="Application fees, net of refunds" /><Stat label="Subscription revenue" value={fmt(st.subscription_revenue_pence)} sub="BD Feast Plus payments" /></div></section>
      <section aria-labelledby="risk"><h2 id="risk" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Needs attention</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Link href="/admin/finance"><Stat label="Failed payments" value={String(st.failed_payments)} /></Link><Link href="/admin/finance"><Stat label="Open disputes" value={String(st.open_disputes)} /></Link><Link href="/admin/restaurants"><Stat label="Pending restaurants" value={String(pending.length)} /></Link></div></section>
      <Card className="p-4 text-xs text-muted">Revenue figures are computed from recorded orders and Stripe-confirmed transactions. They are operational reports, not accounts — reconcile against Stripe and your accountant&apos;s records. VAT is not calculated.</Card>
    </div>
  );
}

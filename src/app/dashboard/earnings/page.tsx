import type { Metadata } from 'next';
import { Badge, Card, Notice, Stat } from '@/components/ui';
import { requireSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { fmt } from '@/lib/money';
import { labelFor } from '@/lib/order-state';
import { listPayouts, restaurantBalances } from '@/lib/services/payouts';
import { effectiveCommission } from '@/lib/refunds';
import { restaurantDue, restaurantEarnings } from '@/lib/services/reports';
import type { Restaurant } from '@/lib/types';
export const metadata: Metadata = { title: 'Earnings — Dashboard' };
export const dynamic = 'force-dynamic';

export default async function Earnings() {
  const s = await requireSession('/dashboard');
  const rid = s.restaurantIds[0];
  const r = (await (await getDb()).get<Restaurant>('restaurants', { id: rid }))!;
  const [{ summary, orders }, balances, payouts] = await Promise.all([restaurantEarnings(rid), restaurantBalances(r), listPayouts(rid)]);
  const paidOut = payouts.filter((p) => p.status === 'paid').reduce((a, p) => a + p.amount_pence, 0);
  const serviceFees = orders.reduce((a, o) => a + (o.service_fee_pence ?? 0), 0);
  const failed = payouts.filter((p) => p.status === 'failed');
  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-semibold text-navy">Earnings & payouts</h2>

      <section aria-labelledby="sales"><h3 id="sales" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Sales — from your orders</h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Paid orders" value={String(summary.orders)} /><Stat label="Food sales" value={fmt(summary.food_sales_pence)} /><Stat label="Delivery charges" value={fmt(summary.delivery_pence)} sub="Yours — no commission" /><Stat label="Gross customer payments" value={fmt(summary.gross_pence)} sub={summary.tips_pence ? `food + delivery + ${fmt(summary.tips_pence)} tips (excludes FeastQuarter's service fee)` : 'Food + delivery (excludes FeastQuarter\'s service fee)'} />
          <Stat label="FeastQuarter commission" value={fmt(summary.commission_pence)} sub="Flat rate on food only. Standard card processing is covered by this commission — no other fees." /><Stat label="Refunds" value={fmt(summary.refunded_pence)} />
          <div className="col-span-2"><Stat label="Customer fee (paid to FeastQuarter, not you)" value={fmt(serviceFees)} sub="The fixed fee customers pay on each order. It is not part of your earnings and is never deducted from them." /></div>
          <div className="col-span-2"><Stat tone="gold" label="Estimated earnings" value={fmt(summary.net_pence)} sub="ESTIMATE from your orders — not the same as money in your bank. See Stripe figures below." /></div>
        </div></section>

      <section aria-labelledby="stripe"><h3 id="stripe" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Settled money — confirmed by Stripe</h3>
        {balances ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Pending in Stripe" value={fmt(balances.pending_pence)} sub="Not yet available" /><Stat label="Available in Stripe" value={fmt(balances.available_pence)} sub="Ready to pay out" /><Stat label="Paid to your bank" value={fmt(paidOut)} sub="Payouts Stripe has confirmed" /><Stat label="Failed payouts" value={String(failed.length)} /></div>
        ) : <Notice tone="gold">Live Stripe balances aren&apos;t available right now (Stripe isn&apos;t connected for this restaurant, or Stripe couldn&apos;t be reached). Estimated earnings above are not a guarantee of payment.</Notice>}
        <p className="mt-2 text-xs text-muted">Card payments take a few working days to become available, then Stripe pays them out to your bank on your payout schedule (FeastQuarter sets weekly payouts where Stripe allows). We can&apos;t promise instant payouts, and a payment is only shown as &ldquo;paid to your bank&rdquo; after Stripe confirms the payout.</p>
        {failed.length > 0 && <div className="mt-3"><Notice tone="red"><strong>{failed.length} payout{failed.length === 1 ? '' : 's'} failed.</strong> {failed[0].failure_message ?? ''} Check your bank details under Payments → Update Stripe details.</Notice></div>}
        <Card className="mt-3 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><caption className="sr-only">Payouts</caption>
          <thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-3">Created</th><th>Expected / arrived</th><th>Status</th><th className="p-3 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-line">{payouts.map((p) => <tr key={p.id}><td className="p-3">{new Date(p.created_at).toLocaleDateString('en-GB')}</td><td>{p.arrival_date ? new Date(p.arrival_date).toLocaleDateString('en-GB') : '—'}</td><td><Badge tone={p.status === 'paid' ? 'green' : p.status === 'failed' ? 'red' : 'gold'}>{p.status.replace('_', ' ')}</Badge></td><td className="p-3 text-right font-medium">{fmt(p.amount_pence)}</td></tr>)}</tbody></table>
          {payouts.length === 0 && <p className="p-5 text-center text-sm text-muted">No payouts recorded yet.</p>}</Card></section>

      <section aria-labelledby="hist"><h3 id="hist" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Transaction history</h3>
        <Card className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><caption className="sr-only">Paid orders</caption>
          <thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-3">Order</th><th>Date</th><th>Type</th><th>Status</th><th className="text-right">Food</th><th className="text-right">Delivery</th><th className="text-right">Commission</th><th className="p-3 text-right">Estimated to you</th></tr></thead>
          <tbody className="divide-y divide-line">{orders.map((o) => <tr key={o.id}><td className="p-3 font-semibold text-navy">{o.reference}</td><td>{new Date(o.created_at).toLocaleDateString('en-GB')}</td><td className="capitalize">{o.fulfilment}</td><td><Badge tone={o.status === 'completed' ? 'green' : 'gold'}>{labelFor(o.status, o.fulfilment)}</Badge></td><td className="text-right">{fmt(o.subtotal_pence)}</td><td className="text-right">{fmt(o.delivery_fee_pence)}</td><td className="text-right">{fmt(effectiveCommission(o))} <span className="text-xs text-muted">({o.commission_bps / 100}%)</span></td><td className="p-3 text-right font-semibold">{fmt(restaurantDue(o))}</td></tr>)}</tbody></table>
          {orders.length === 0 && <p className="p-6 text-center text-sm text-muted">No paid orders yet.</p>}</Card></section>
    </div>
  );
}

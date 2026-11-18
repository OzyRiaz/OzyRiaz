import type { Metadata } from 'next';
import { Badge, Card, Stat } from '@/components/ui';
import { requireSession } from '@/lib/auth/session';
import { fmt } from '@/lib/money';
import { STATUS_LABEL } from '@/lib/order-state';
import { restaurantEarnings } from '@/lib/services/reports';
export const metadata: Metadata = { title: 'Earnings — Dashboard' };
export const dynamic = 'force-dynamic';

export default async function Earnings() {
  const s = await requireSession('/dashboard');
  const { summary, orders } = await restaurantEarnings(s.restaurantIds[0]);
  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl font-semibold text-navy">Earnings & commission</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Paid orders" value={String(summary.orders)} /><Stat label="Gross sales" value={fmt(summary.gross_pence)} sub="What customers paid" />
        <Stat label="FeastQuarter commission" value={fmt(summary.commission_pence)} sub="8% delivery · 5% collection (food only)" /><Stat tone="gold" label="Your net earnings" value={fmt(summary.net_pence)} sub="Paid to your Stripe account" />
      </div>
      {summary.refunded_pence > 0 && <p className="text-sm text-muted">Includes {fmt(summary.refunded_pence)} refunded to customers.</p>}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm"><caption className="sr-only">Completed and paid orders</caption>
          <thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-3">Order</th><th>Date</th><th>Type</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Commission</th><th className="p-3 text-right">You receive</th></tr></thead>
          <tbody className="divide-y divide-line">{orders.map((o) => <tr key={o.id}><td className="p-3 font-semibold text-navy">{o.reference}</td><td>{new Date(o.created_at).toLocaleDateString('en-GB')}</td><td className="capitalize">{o.fulfilment}</td><td><Badge tone={o.status === 'completed' ? 'green' : 'gold'}>{STATUS_LABEL[o.status]}</Badge></td><td className="text-right">{fmt(o.total_pence)}</td><td className="text-right">{fmt(o.application_fee_pence)} <span className="text-xs text-muted">({o.commission_bps / 100}%)</span></td><td className="p-3 text-right font-semibold">{fmt(o.restaurant_net_pence - Math.round(o.restaurant_net_pence * o.refunded_pence / Math.max(o.total_pence, 1)))}</td></tr>)}</tbody></table>
        {orders.length === 0 && <p className="p-6 text-center text-sm text-muted">No paid orders yet.</p>}
      </Card>
    </div>
  );
}

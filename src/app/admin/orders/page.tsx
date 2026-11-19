import type { Metadata } from 'next';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Badge, Card, Input } from '@/components/ui';
import { getDb } from '@/lib/db';
import { fmt } from '@/lib/money';
import { labelFor } from '@/lib/order-state';
import type { Order, Restaurant } from '@/lib/types';
import { refundAction } from '../actions';
export const metadata: Metadata = { title: 'Orders — Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminOrders() {
  const db = await getDb();
  const [orders, rs] = await Promise.all([db.select<Order>('orders', {}, { order: ['created_at', 'desc'], limit: 100 }), db.select<Restaurant>('restaurants')]);
  const name = new Map(rs.map((r) => [r.id, r.name]));
  return (
    <div className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-display text-2xl font-semibold text-navy">Orders</h2><a href="/api/admin/export/orders" className="text-sm font-semibold text-navy underline">Export CSV</a></div>
      <Card className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><caption className="sr-only">Latest 100 orders</caption>
        <thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-3">Order</th><th>Restaurant</th><th>Type</th><th>Status</th><th>Payment</th><th className="text-right">Total</th><th className="text-right">Fee</th><th className="p-3">Refund</th></tr></thead>
        <tbody className="divide-y divide-line">{orders.map((o) => (
          <tr key={o.id} className="align-top"><td className="p-3 font-semibold text-navy">{o.reference}<br /><span className="text-xs font-normal text-muted">{new Date(o.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span></td><td>{name.get(o.restaurant_id)}</td><td className="capitalize">{o.fulfilment}</td><td>{labelFor(o.status, o.fulfilment)}</td>
            <td><Badge tone={o.payment_status === 'paid' ? 'green' : o.payment_status === 'unpaid' ? 'grey' : o.payment_status === 'failed' || o.payment_status === 'disputed' ? 'red' : 'gold'}>{o.payment_status.replace('_', ' ')}</Badge></td><td className="text-right">{fmt(o.total_pence)}</td><td className="text-right">{fmt(o.application_fee_pence)}</td>
            <td className="p-3">{['paid', 'partially_refunded'].includes(o.payment_status) && o.total_pence > o.refunded_pence ? (
              <details><summary className="cursor-pointer text-xs font-semibold text-navy underline">Refund…</summary><ActionForm action={refundAction} className="mt-2 flex w-56 flex-col gap-1.5"><input type="hidden" name="id" value={o.id} /><Input name="amount" inputMode="decimal" placeholder={`Max ${((o.total_pence - o.refunded_pence) / 100).toFixed(2)}`} required /><Input name="reason" placeholder="Reason" required /><Submit size="sm" variant="danger">Issue refund</Submit></ActionForm></details>) : o.refunded_pence > 0 ? <span className="text-xs text-muted">Refunded {fmt(o.refunded_pence)}</span> : null}</td></tr>))}</tbody></table>
        {orders.length === 0 && <p className="p-6 text-center text-sm text-muted">No orders yet.</p>}</Card></div>
  );
}

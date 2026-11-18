import type { Metadata } from 'next';
import Link from 'next/link';
import { LiveRefresh } from '@/components/LiveRefresh';
import { Badge, Card, EmptyState, Notice } from '@/components/ui';
import { requireSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { fmt } from '@/lib/money';
import { ACTIVE, nextRestaurantStatuses, STATUS_LABEL } from '@/lib/order-state';
import type { Order, OrderStatus, Profile, Restaurant } from '@/lib/types';
import { orderStatusAction } from './actions';
import clsx from 'clsx';
export const metadata: Metadata = { title: 'Orders — Dashboard' };
export const dynamic = 'force-dynamic';

const verb: Partial<Record<OrderStatus, string>> = { accepted: 'Accept order', preparing: 'Start preparing', ready: 'Mark ready', out_for_delivery: 'Out for delivery', completed: 'Complete' };

export default async function DashboardOrders({ searchParams }: { searchParams: Promise<{ error?: string; denied?: string }> }) {
  const s = await requireSession('/dashboard');
  const sp = await searchParams;
  const rid = s.restaurantIds[0];
  const db = await getDb();
  const r = (await db.get<Restaurant>('restaurants', { id: rid }))!;
  const orders = (await db.select<Order>('orders', { restaurant_id: rid }, { order: ['created_at', 'desc'], limit: 60 })).filter((o) => o.payment_status !== 'unpaid' && o.status !== 'pending_payment' && o.status !== 'payment_failed' && o.status !== 'cancelled');
  const active = orders.filter((o) => ACTIVE.includes(o.status)).reverse();
  const done = orders.filter((o) => !ACTIVE.includes(o.status)).slice(0, 10);
  const customers = new Map((await db.select<Profile>('profiles')).map((p) => [p.id, p]));
  const waiting = active.filter((o) => o.status === 'awaiting_restaurant').length;
  return (
    <div className="space-y-5">
      <LiveRefresh pending={waiting} />
      {sp.error && <Notice tone="red">{sp.error}</Notice>}
      {r.status === 'pending' && <Notice tone="gold"><strong>Your application is being reviewed.</strong> Complete your <Link className="underline" href="/dashboard/menu">menu</Link>, <Link className="underline" href="/dashboard/delivery">delivery areas</Link> and <Link className="underline" href="/dashboard/payments">Stripe payments</Link> while you wait.</Notice>}
      {r.status === 'approved' && !r.stripe_charges_enabled && <Notice tone="red"><strong>You can&apos;t take orders yet.</strong> Finish Stripe onboarding in <Link className="underline" href="/dashboard/payments">Payments</Link>.</Notice>}
      {r.status === 'suspended' && <Notice tone="red">Your restaurant is suspended. Contact FeastQuarter support.</Notice>}
      <div className="flex items-center justify-between"><h2 className="font-display text-2xl font-semibold text-navy">Live orders {waiting > 0 && <Badge tone="red" className="ml-2 animate-pulse">{waiting} new</Badge>}</h2><span className="text-xs text-muted">Auto-refreshes every 10s</span></div>
      {active.length === 0 ? <EmptyState title="No live orders" body="New paid orders appear here instantly. Keep this page open on your tablet." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((o) => {
            const next = nextRestaurantStatuses(o.status, o.fulfilment);
            const c = customers.get(o.customer_id);
            return (
              <Card key={o.id} className={clsx('p-4', o.status === 'awaiting_restaurant' && 'border-gold ring-2 ring-gold/50')}>
                <div className="flex items-start justify-between gap-2"><div><p className="font-display text-lg font-semibold text-navy">{o.reference}</p><p className="text-xs text-muted">{new Date(o.paid_at ?? o.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {c?.full_name}{o.contact_phone ? ` · ${o.contact_phone}` : ''}</p></div>
                  <div className="text-right"><Badge tone={o.fulfilment === 'delivery' ? 'navy' : 'gold'}>{o.fulfilment === 'delivery' ? 'Delivery' : 'Collection'}</Badge><p className="mt-1 text-xs font-semibold text-navy">{STATUS_LABEL[o.status]}</p></div></div>
                <ul className="mt-3 space-y-1 text-sm">{o.lines.map((l, i) => <li key={i}><strong>{l.qty}×</strong> {l.name}{l.options.length > 0 && <span className="text-muted"> ({l.options.map((x) => x.choice).join(', ')})</span>}{l.note && <span className="block text-xs italic text-muted">“{l.note}”</span>}</li>)}</ul>
                {o.customer_note && <p className="mt-2 rounded-lg bg-gold-100 px-2.5 py-1.5 text-xs text-[#5c430a]">Note: {o.customer_note}</p>}
                {o.fulfilment === 'delivery' && o.delivery_address && <p className="mt-2 text-sm text-muted">📍 {o.delivery_address.line1}, {o.delivery_address.postcode}</p>}
                <p className="mt-2 flex justify-between border-t border-line pt-2 text-sm"><span className="text-muted">Total {fmt(o.total_pence)} · you receive</span><strong className="text-navy">{fmt(o.restaurant_net_pence)}</strong></p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {next.filter((n) => n !== 'rejected').map((n) => <form key={n} action={orderStatusAction} className="flex-1"><input type="hidden" name="id" value={o.id} /><input type="hidden" name="to" value={n} /><button className="w-full rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white active:scale-[.98]">{verb[n] ?? STATUS_LABEL[n]}</button></form>)}
                  {next.includes('rejected') && (
                    <details className="w-full"><summary className="cursor-pointer list-none rounded-xl border border-red-200 px-4 py-2.5 text-center text-sm font-semibold text-danger marker:hidden">Reject & refund</summary>
                      <form action={orderStatusAction} className="mt-2 space-y-2"><input type="hidden" name="id" value={o.id} /><input type="hidden" name="to" value="rejected" /><input name="reason" required minLength={3} placeholder="Reason shown to customer (e.g. kitchen closed)" className="w-full rounded-lg border border-line px-3 py-2 text-sm" /><button className="w-full rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white">Confirm rejection — customer refunded in full</button></form></details>)}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {done.length > 0 && <><h2 className="pt-4 font-display text-xl font-semibold text-navy">Recent</h2><Card className="divide-y divide-line">{done.map((o) => <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span><strong className="text-navy">{o.reference}</strong> · {o.fulfilment} · {new Date(o.created_at).toLocaleDateString('en-GB')}</span><span className="flex items-center gap-2"><Badge tone={o.status === 'completed' ? 'green' : 'red'}>{STATUS_LABEL[o.status]}</Badge>{fmt(o.total_pence)}</span></div>)}</Card></>}
    </div>
  );
}

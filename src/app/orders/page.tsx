import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, Container, EmptyState, PageTitle, LinkButton } from '@/components/ui';
import { requireSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { fmt } from '@/lib/money';
import { labelFor } from '@/lib/order-state';
import type { Order, Restaurant } from '@/lib/types';
export const metadata: Metadata = { title: 'Your orders' };
export const dynamic = 'force-dynamic';

export default async function Orders() {
  const s = await requireSession('/orders');
  const db = await getDb();
  const orders = await db.select<Order>('orders', { customer_id: s.userId }, { order: ['created_at', 'desc'] });
  const rs = new Map((await db.select<Restaurant>('restaurants')).map((r) => [r.id, r]));
  return (
    <Container className="py-8">
      <PageTitle title="Your orders" sub="Track current orders and view past receipts." />
      {orders.length === 0 ? <EmptyState title="No orders yet" body="Your orders and receipts will appear here." action={<LinkButton href="/restaurants">Find food</LinkButton>} /> : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`}><Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition hover:shadow-lift">
                <div><p className="font-display text-lg font-semibold text-navy">{rs.get(o.restaurant_id)?.name}</p><p className="text-sm text-muted">{o.reference} · {new Date(o.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · {o.fulfilment}</p></div>
                <div className="flex items-center gap-3"><Badge tone={o.status === 'completed' ? 'green' : ['rejected', 'cancelled', 'payment_failed'].includes(o.status) ? 'red' : 'gold'}>{labelFor(o.status, o.fulfilment)}</Badge><span className="font-semibold text-navy">{fmt(o.total_pence)}</span></div>
              </Card></Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}

import Link from 'next/link';
import { CheckCircle2, Clock } from 'lucide-react';
import { OrderTracker } from '@/components/OrderTracker';
import { Card, Container, LinkButton } from '@/components/ui';
import { ClearBasket } from '@/components/ClearBasket';
import { requireSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import type { Order } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Landing page after Stripe Checkout. It only DISPLAYS state; it never marks anything paid.
 * Payment is confirmed by the signed Stripe webhook. We poll until the order flips.
 */
export default async function Success({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const s = await requireSession('/orders');
  const id = (await searchParams).order ?? '';
  const o = await (await getDb()).get<Order>('orders', { id });
  if (!o || o.customer_id !== s.userId) return <Container className="py-16 text-center">Order not found. <Link className="underline" href="/orders">View your orders</Link></Container>;
  const paid = o.payment_status === 'paid';
  return (
    <Container className="max-w-2xl py-12">
      {paid && <ClearBasket />}
      <Card className="p-8 text-center">
        {paid ? <CheckCircle2 className="mx-auto text-ok" size={52} /> : <Clock className="mx-auto animate-pulse text-gold-600" size={52} />}
        <h1 className="mt-4 font-display text-3xl font-semibold text-navy">{paid ? 'Order placed — thank you!' : 'Confirming your payment…'}</h1>
        <p className="mt-2 text-muted">{paid ? `Order ${o.reference} has been sent to the restaurant.` : `We're waiting for confirmation from our payment provider for order ${o.reference}. This page updates automatically — please don't pay twice.`}</p>
        <div className="mt-8 text-left"><OrderTracker status={o.status} fulfilment={o.fulfilment} live={!paid} /></div>
        <div className="mt-8"><LinkButton href={`/orders/${o.id}`} variant="primary">View order & receipt</LinkButton></div>
      </Card>
    </Container>
  );
}

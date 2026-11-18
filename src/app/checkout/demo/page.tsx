import { notFound } from 'next/navigation';
import { demoPayAction } from '@/app/actions/customer';
import { Card, Container, Notice } from '@/components/ui';
import { requireSession } from '@/lib/auth/session';
import { demoPaymentsEnabled } from '@/lib/config';
import { getDb } from '@/lib/db';
import { fmt } from '@/lib/money';
import type { Order } from '@/lib/types';
import { Submit } from '@/components/ActionForm';

export default async function DemoPay({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  if (!demoPaymentsEnabled()) notFound();
  const s = await requireSession('/checkout');
  const o = await (await getDb()).get<Order>('orders', { id: (await searchParams).order ?? '' });
  if (!o || o.customer_id !== s.userId) notFound();
  return (
    <Container className="max-w-md py-12">
      <Card className="p-7">
        <Notice tone="gold"><strong>Simulated payment — demo mode.</strong> No card is charged. In live mode this page is replaced by Stripe Checkout.</Notice>
        <h1 className="mt-5 font-display text-2xl font-semibold text-navy">Pay {fmt(o.total_pence)}</h1>
        <p className="text-sm text-muted">Order {o.reference}</p>
        <dl className="mt-4 space-y-1 text-sm"><div className="flex justify-between"><dt>Commission ({o.commission_bps / 100}%)</dt><dd>{fmt(o.application_fee_pence)}</dd></div><div className="flex justify-between"><dt>Restaurant receives</dt><dd>{fmt(o.restaurant_net_pence)}</dd></div></dl>
        <form action={demoPayAction} className="mt-6"><input type="hidden" name="order" value={o.id} /><Submit variant="gold" className="w-full" size="lg" pendingText="Confirming…">Simulate successful payment</Submit></form>
      </Card>
    </Container>
  );
}

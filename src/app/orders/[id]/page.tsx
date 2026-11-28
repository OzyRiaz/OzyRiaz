import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { OrderTracker } from '@/components/OrderTracker';
import { PrintButton } from '@/components/PrintButton';
import { ReorderButton } from '@/components/ReorderButton';
import { ActionForm } from '@/components/ActionForm';
import { cancelOrderAction, requestRefundAction } from '@/app/actions/customer';
import { getSettings } from '@/lib/services/settings';
import { Textarea } from '@/components/ui';
import { Submit } from '@/components/ActionForm';
import { Badge, Card, Container, Notice } from '@/components/ui';
import { requireSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { fmt } from '@/lib/money';
import { ACTIVE, labelFor } from '@/lib/order-state';
import { createPaymentSession } from '@/lib/services/orders';
import { PushToggle } from '@/components/PushToggle';
import { pushConfigured, vapidPublicKey } from '@/lib/services/push';
import type { Order, Restaurant } from '@/lib/types';
export const metadata: Metadata = { title: 'Order' };
export const dynamic = 'force-dynamic';

async function retryPay(fd: FormData) {
  'use server';
  const s = await requireSession('/orders');
  const o = await (await getDb()).get<Order>('orders', { id: String(fd.get('id')) });
  if (!o || o.customer_id !== s.userId || o.payment_status === 'paid') redirect('/orders');
  const { url } = await createPaymentSession(o!, s.email);
  redirect(url);
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession('/orders');
  const db = await getDb();
  const o = await db.get<Order>('orders', { id: (await params).id });
  if (!o || o.customer_id !== s.userId) notFound(); // never reveal other customers' orders
  const r = (await db.get<Restaurant>('restaurants', { id: o.restaurant_id }))!;
  const unpaid = o.status === 'pending_payment' || o.status === 'payment_failed';
  return (
    <Container className="max-w-3xl py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm text-muted">Order {o.reference}</p><h1 className="font-display text-3xl font-semibold text-navy">{r.name}</h1></div>
        <div className="flex flex-wrap items-center gap-2"><ReorderButton orderId={o.id} /><Badge tone={o.status === 'completed' ? 'green' : ['rejected', 'cancelled', 'payment_failed'].includes(o.status) ? 'red' : 'gold'}>{labelFor(o.status, o.fulfilment)}</Badge><PrintButton /></div>
      </div>
      <div className="mt-5 space-y-4">
        {o.status === 'rejected' && <Notice tone="red">The restaurant couldn&apos;t accept this order{o.rejection_reason ? `: ${o.rejection_reason}` : ''}. You&apos;ve been refunded in full ({fmt(o.refunded_pence)}); it can take 5–10 working days to arrive.</Notice>}
        {unpaid && <Card className="p-5"><Notice tone={o.status === 'payment_failed' ? 'red' : 'gold'}>{o.status === 'payment_failed' ? 'Your payment failed, so this order has not been sent to the restaurant.' : 'This order is waiting for payment and has not been sent to the restaurant.'}</Notice>
          <form action={retryPay} className="mt-3"><input type="hidden" name="id" value={o.id} /><Submit variant="gold">Pay now</Submit></form></Card>}
        {o.refunded_pence > 0 && o.status !== 'rejected' && <Notice tone="green">Refunded {fmt(o.refunded_pence)}.</Notice>}
        {o.payment_status === 'disputed' && <Notice tone="gold">A payment dispute is open on this order.</Notice>}
        {ACTIVE.includes(o.status) || o.status === 'completed' ? <Card className="p-5"><OrderTracker status={o.status} fulfilment={o.fulfilment} live={ACTIVE.includes(o.status)} /></Card> : null}
        {ACTIVE.includes(o.status) && pushConfigured() && <Card className="p-4"><PushToggle audience="customer" publicKey={vapidPublicKey()} /></Card>}
        {['accepted', 'preparing'].includes(o.status) && o.ready_in_minutes && <Notice tone="navy">The restaurant expects your order to be ready in about <strong>{o.ready_in_minutes} minutes</strong> from {o.accepted_at ? new Date(o.accepted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'acceptance'}.</Notice>}
        <Card className="p-5">
          <h2 className="font-display text-xl font-semibold text-navy">{o.fulfilment === 'delivery' ? 'Delivery to' : 'Collect from'}</h2>
          <p className="mt-1 text-sm text-muted">{o.fulfilment === 'delivery' && o.delivery_address ? `${o.delivery_address.line1}${o.delivery_address.line2 ? ', ' + o.delivery_address.line2 : ''}, ${o.delivery_address.city} ${o.delivery_address.postcode}` : `${r.address_line1}, ${r.postcode}${r.phone ? ' · ' + r.phone : ''}`}</p>
          {o.fulfilment === 'delivery' && <p className="mt-1 text-xs text-muted">Delivered by the restaurant&apos;s own driver.</p>}
        </Card>
        <Card className="p-5" >
          <h2 className="font-display text-xl font-semibold text-navy">Receipt</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {o.lines.map((l, i) => <li key={i} className="flex justify-between gap-4 py-2"><span>{l.qty}× {l.name}{l.options.length > 0 && <span className="block text-xs text-muted">{l.options.map((x) => x.choice).join(', ')}</span>}{l.allergens.length > 0 && <span className="block text-xs text-muted">Contains: {l.allergens.join(', ')}</span>}</span><span>{fmt(l.unit_price_pence * l.qty)}</span></li>)}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt>Food subtotal</dt><dd>{fmt(o.subtotal_pence)}</dd></div>
            {o.discount_pence > 0 && <div className="flex justify-between text-ok"><dt>{o.discount_label}</dt><dd>−{fmt(o.discount_pence)}</dd></div>}
            {o.delivery_fee_pence > 0 && <div className="flex justify-between"><dt>Delivery</dt><dd>{fmt(o.delivery_fee_pence)}</dd></div>}
            {o.tip_pence > 0 && <div className="flex justify-between"><dt>Tip</dt><dd>{fmt(o.tip_pence)}</dd></div>}
            {(o.service_fee_pence ?? 0) > 0 && <div className="flex justify-between"><dt>FeastQuarter service fee</dt><dd>{fmt(o.service_fee_pence)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 font-display text-lg font-semibold text-navy"><dt>Total paid</dt><dd>{fmt(o.total_pence)}</dd></div>
            {o.refunded_pence > 0 && <div className="flex justify-between"><dt>Refunded</dt><dd>−{fmt(o.refunded_pence)}</dd></div>}
            {o.refunded_pence > 0 && (o.refunded_service_fee_pence ?? 0) > 0 && <div className="flex justify-between text-xs text-muted"><dt>&nbsp;&nbsp;of which service fee</dt><dd>−{fmt(o.refunded_service_fee_pence)}</dd></div>}
          </dl>
          <p className="mt-3 text-xs text-muted">Placed {new Date(o.created_at).toLocaleString('en-GB')}{o.paid_at ? ` · Paid ${new Date(o.paid_at).toLocaleString('en-GB')}` : ''}. Prices include any VAT the restaurant charges; this is not a VAT invoice.</p>
        </Card>
        {o.payment_status === 'paid' && o.status === 'awaiting_restaurant' && (
          <Card className="no-print p-5"><h2 className="font-display text-lg font-semibold text-navy">Changed your mind?</h2>
            <p className="mt-1 text-sm text-muted">You can cancel until the restaurant accepts your order. {(await getSettings()).service_fee_refund_on_customer_cancel ? `You will be refunded in full, including the ${fmt(o.service_fee_pence ?? 0)} FeastQuarter service fee.` : `You will be refunded everything except the ${fmt(o.service_fee_pence ?? 0)} FeastQuarter service fee.`}</p>
            <ActionForm action={cancelOrderAction} className="mt-3"><input type="hidden" name="order" value={o.id} /><Submit variant="outline">Cancel this order</Submit></ActionForm></Card>)}
        {['paid', 'partially_refunded'].includes(o.payment_status) && o.refunded_pence < o.total_pence && (
          <Card className="no-print p-5"><details><summary className="cursor-pointer font-semibold text-navy">Problem with this order? Request a refund</summary>
            <p className="mt-2 text-sm text-muted">Contact the restaurant first for late or incorrect food{r.phone ? ` (${r.phone})` : ''}. If it isn&apos;t resolved, tell us what happened and we&apos;ll review it. Your statutory rights are not affected.</p>
            <ActionForm action={requestRefundAction} className="mt-3 space-y-3"><input type="hidden" name="order" value={o.id} /><Textarea name="reason" rows={3} minLength={10} required placeholder="What went wrong?" /><Submit variant="outline">Send refund request</Submit></ActionForm></details></Card>)}
      </div>
    </Container>
  );
}

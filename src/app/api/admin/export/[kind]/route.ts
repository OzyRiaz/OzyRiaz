import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { csv, revenueReport, type ReportGroup } from '@/lib/services/reports';
import type { Order, OrderRefund, Profile, Restaurant, Transaction } from '@/lib/types';

export const dynamic = 'force-dynamic';
const p = (n: number) => (n / 100).toFixed(2);

export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const s = await getSession();
  if (!s || s.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const db = await getDb();
  const kind = (await params).kind;
  let rows: Record<string, unknown>[];
  if (kind === 'orders') {
    const rs = new Map((await db.select<Restaurant>('restaurants')).map((r) => [r.id, r.name]));
    rows = (await db.select<Order>('orders', {}, { order: ['created_at', 'desc'] })).map((o) => ({ reference: o.reference, created: o.created_at, restaurant: rs.get(o.restaurant_id), fulfilment: o.fulfilment, status: o.status, payment_status: o.payment_status, subtotal_gbp: p(o.subtotal_pence), delivery_gbp: p(o.delivery_fee_pence), discount_gbp: p(o.discount_pence), total_gbp: p(o.total_pence), commission_rate_pct: o.commission_bps / 100, service_fee_gbp: p(o.service_fee_pence ?? 0), application_fee_gbp: p(o.application_fee_pence), refunded_service_fee_gbp: p(o.refunded_service_fee_pence ?? 0), stripe_fee_gbp: o.stripe_fee_pence == null ? '' : p(o.stripe_fee_pence), restaurant_net_gbp: p(o.restaurant_net_pence), refunded_gbp: p(o.refunded_pence) }));
  } else if (kind === 'transactions' || kind === 'refunds') {
    const tx = await db.select<Transaction>('transactions', kind === 'refunds' ? { kind: 'refund' } : {}, { order: ['created_at', 'desc'] });
    rows = tx.map((t) => ({ id: t.id, created: t.created_at, kind: t.kind, status: t.status, amount_gbp: p(t.amount_pence), order_id: t.order_id, stripe_ref: t.stripe_ref, note: t.note }));
  } else if (kind === 'refund-audit') {
    rows = (await db.select<OrderRefund>('order_refunds', {}, { order: ['created_at', 'desc'] })).map((r) => ({ created: r.created_at, order_id: r.order_id, kind: r.kind, amount_gbp: p(r.amount_pence), food_gbp: p(r.food_pence), delivery_gbp: p(r.delivery_pence), tip_gbp: p(r.tip_pence), service_fee_gbp: p(r.service_fee_pence), commission_returned_gbp: p(r.commission_returned_pence), restaurant_share_gbp: p(r.restaurant_share_pence), platform_share_gbp: p(r.platform_share_pence), reason: r.reason, actor: r.actor_id, stripe_refund: r.stripe_refund_id, stripe_reversal: r.stripe_reversal_id, reversal_error: r.reversal_error }));
  } else if (kind.startsWith('revenue-')) {
    const g = kind.slice(8) as ReportGroup;
    if (!['day', 'week', 'month', 'restaurant', 'city'].includes(g)) return NextResponse.json({ error: 'Unknown export' }, { status: 404 });
    rows = (await revenueReport(g)).map((r) => ({ [g]: r.group, orders: r.orders, delivery_orders: r.delivery_orders, collection_orders: r.collection_orders, gmv_gbp: p(r.gmv_pence), food_sales_gbp: p(r.food_sales_pence), delivery_charges_gbp: p(r.delivery_charges_pence), commission_gbp: p(r.commission_pence), service_fees_gbp: p(r.service_fee_pence), platform_income_gbp: p(r.platform_income_pence), refunds_gbp: p(r.refunds_pence), restaurant_allocation_gbp: p(r.restaurant_allocation_pence), stripe_fees_actual_gbp: p(r.stripe_fees_actual_pence), stripe_fees_estimated_gbp: p(r.stripe_fees_estimated_pence), net_contribution_gbp: p(r.net_contribution_pence), repeat_customers: r.repeat_customers }));
  } else if (kind === 'restaurants') {
    rows = (await db.select<Restaurant>('restaurants')).map((r) => ({ name: r.name, status: r.status, postcode: r.postcode, demo: r.is_demo, featured: r.featured, stripe_charges_enabled: r.stripe_charges_enabled, stripe_payouts_enabled: r.stripe_payouts_enabled, created: r.created_at }));
  } else if (kind === 'customers') {
    rows = (await db.select<Profile>('profiles', { role: 'customer' })).map((u) => ({ name: u.full_name, email: u.email, suspended: u.suspended, created: u.created_at }));
  } else return NextResponse.json({ error: 'Unknown export' }, { status: 404 });
  return new NextResponse(csv(rows) || 'no data', { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="feastquarter-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
}

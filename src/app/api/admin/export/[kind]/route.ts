import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { csv } from '@/lib/services/reports';
import type { Order, Profile, Restaurant, Transaction } from '@/lib/types';

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
    rows = (await db.select<Order>('orders', {}, { order: ['created_at', 'desc'] })).map((o) => ({ reference: o.reference, created: o.created_at, restaurant: rs.get(o.restaurant_id), fulfilment: o.fulfilment, status: o.status, payment_status: o.payment_status, subtotal_gbp: p(o.subtotal_pence), delivery_gbp: p(o.delivery_fee_pence), discount_gbp: p(o.discount_pence), total_gbp: p(o.total_pence), commission_rate_pct: o.commission_bps / 100, application_fee_gbp: p(o.application_fee_pence), restaurant_net_gbp: p(o.restaurant_net_pence), refunded_gbp: p(o.refunded_pence) }));
  } else if (kind === 'transactions' || kind === 'refunds') {
    const tx = await db.select<Transaction>('transactions', kind === 'refunds' ? { kind: 'refund' } : {}, { order: ['created_at', 'desc'] });
    rows = tx.map((t) => ({ id: t.id, created: t.created_at, kind: t.kind, status: t.status, amount_gbp: p(t.amount_pence), order_id: t.order_id, stripe_ref: t.stripe_ref, note: t.note }));
  } else if (kind === 'restaurants') {
    rows = (await db.select<Restaurant>('restaurants')).map((r) => ({ name: r.name, status: r.status, postcode: r.postcode, demo: r.is_demo, featured: r.featured, stripe_charges_enabled: r.stripe_charges_enabled, stripe_payouts_enabled: r.stripe_payouts_enabled, created: r.created_at }));
  } else if (kind === 'customers') {
    rows = (await db.select<Profile>('profiles', { role: 'customer' })).map((u) => ({ name: u.full_name, email: u.email, suspended: u.suspended, created: u.created_at }));
  } else return NextResponse.json({ error: 'Unknown export' }, { status: 404 });
  return new NextResponse(csv(rows) || 'no data', { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="feastquarter-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
}

import { getDb } from '../db';
import type { Membership, Order, Restaurant, Transaction } from '../types';

const paidStates = new Set(['paid', 'partially_refunded', 'refunded', 'disputed']);
const net = (o: Order) => Math.round((o.application_fee_pence * (o.total_pence - o.refunded_pence)) / Math.max(o.total_pence, 1));

export interface PlatformStats {
  gmv_pence: number;                // gross value of all paid orders (what customers paid, before refunds)
  refunded_pence: number;
  commission_revenue_pence: number; // FeastQuarter application fees, net of refunds
  subscription_revenue_pence: number;
  platform_revenue_pence: number;   // commission + subscriptions  (NOT GMV)
  active_members: number;
  paid_orders: number;
  failed_payments: number;
  open_disputes: number;
}

export async function platformStats(range?: { from?: Date; to?: Date }): Promise<PlatformStats> {
  const db = await getDb();
  const inRange = (iso: string | null) => !!iso && (!range?.from || new Date(iso) >= range.from) && (!range?.to || new Date(iso) <= range.to);
  const orders = (await db.select<Order>('orders')).filter((o) => paidStates.has(o.payment_status) && inRange(o.paid_at));
  const tx = (await db.select<Transaction>('transactions')).filter((t) => inRange(t.created_at));
  const members = (await db.select<Membership>('memberships')).filter((m) => m.status === 'active');
  const gmv = orders.reduce((s, o) => s + o.total_pence, 0);
  const refunded = orders.reduce((s, o) => s + o.refunded_pence, 0);
  const commission = orders.reduce((s, o) => s + net(o), 0);
  const subs = tx.filter((t) => t.kind === 'membership_payment').reduce((s, t) => s + t.amount_pence, 0);
  return {
    gmv_pence: gmv, refunded_pence: refunded, commission_revenue_pence: commission, subscription_revenue_pence: subs,
    platform_revenue_pence: commission + subs, active_members: members.length, paid_orders: orders.length,
    failed_payments: tx.filter((t) => t.kind === 'payment_failed').length,
    open_disputes: tx.filter((t) => t.kind === 'dispute' && t.status === 'open').length,
  };
}

export interface RestaurantEarnings { orders: number; gross_pence: number; commission_pence: number; refunded_pence: number; net_pence: number }
export async function restaurantEarnings(restaurantId: string): Promise<{ summary: RestaurantEarnings; orders: Order[] }> {
  const orders = (await (await getDb()).select<Order>('orders', { restaurant_id: restaurantId }, { order: ['created_at', 'desc'] })).filter((o) => paidStates.has(o.payment_status));
  const summary = orders.reduce<RestaurantEarnings>((s, o) => {
    const kept = o.total_pence - o.refunded_pence;
    const fee = net(o);
    return { orders: s.orders + 1, gross_pence: s.gross_pence + o.total_pence, commission_pence: s.commission_pence + fee, refunded_pence: s.refunded_pence + o.refunded_pence, net_pence: s.net_pence + kept - fee };
  }, { orders: 0, gross_pence: 0, commission_pence: 0, refunded_pence: 0, net_pence: 0 });
  return { summary, orders };
}

export async function dailySummary(day = new Date()) {
  const from = new Date(day); from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 864e5 - 1);
  const s = await platformStats({ from, to });
  const db = await getDb();
  const pending = (await db.select<Restaurant>('restaurants', { status: 'pending' })).length;
  return { date: from.toISOString().slice(0, 10), ...s, pending_restaurants: pending };
}

export const csv = (rows: Record<string, unknown>[]): string => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
};

import { getDb } from '../db';
import { estimateProcessingFee } from '../money';
import type { Membership, Order, Profile, Restaurant, Transaction } from '../types';

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

export interface RestaurantEarnings { orders: number; gross_pence: number; commission_pence: number; refunded_pence: number; net_pence: number; food_sales_pence: number; delivery_pence: number; tips_pence: number }
export async function restaurantEarnings(restaurantId: string): Promise<{ summary: RestaurantEarnings; orders: Order[] }> {
  const orders = (await (await getDb()).select<Order>('orders', { restaurant_id: restaurantId }, { order: ['created_at', 'desc'] })).filter((o) => paidStates.has(o.payment_status));
  const summary = orders.reduce<RestaurantEarnings>((s, o) => {
    const kept = o.total_pence - o.refunded_pence;
    const fee = net(o);
    return { orders: s.orders + 1, gross_pence: s.gross_pence + o.total_pence, commission_pence: s.commission_pence + fee, refunded_pence: s.refunded_pence + o.refunded_pence, net_pence: s.net_pence + kept - fee, food_sales_pence: s.food_sales_pence + o.subtotal_pence - o.discount_funded_by_restaurant_pence, delivery_pence: s.delivery_pence + o.delivery_fee_pence, tips_pence: s.tips_pence + (o.tip_pence ?? 0) };
  }, { orders: 0, gross_pence: 0, commission_pence: 0, refunded_pence: 0, net_pence: 0, food_sales_pence: 0, delivery_pence: 0, tips_pence: 0 });
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


// ---------------------------------------------------------------------------------------------------------
// Accountant-grade breakdown + admin overview. GROSS CUSTOMER PAYMENTS ARE NEVER FEASTQUARTER REVENUE.
// ---------------------------------------------------------------------------------------------------------
export interface Breakdown {
  paid_orders: number;
  food_sales_pence: number;            // restaurants' food sales (pass-through; NOT FeastQuarter revenue)
  delivery_charges_pence: number;      // restaurants' delivery fees (pass-through)
  tips_pence: number;                  // pass-through to restaurants
  gross_customer_payments_pence: number;
  refunds_pence: number;
  restaurant_allocation_pence: number; // what restaurants are due after commission and refunds (ESTIMATE until Stripe payouts confirm)
  platform_commission_pence: number;   // FeastQuarter's commission kept, net of refunds, excluding VAT
  platform_vat_on_commission_pence: number;
  membership_revenue_pence: number;
  platform_taxable_revenue_pence: number; // commission + membership (the figure relevant to the VAT threshold)
  processing_fees_actual_pence: number;
  processing_fees_estimated_pence: number; // ONLY for orders not yet reconciled; labelled as an estimate
  orders_missing_fee_data: number;
  other_stripe_costs_pence: number;    // Connect account/payout fees etc. entered from Stripe invoices
  net_contribution_pence: number;      // taxable revenue − processing (actual + estimated) − other Stripe costs
  disputes_open: number;
  disputes_lost_pence: number;
}

const PAID = new Set(['paid', 'partially_refunded', 'refunded', 'disputed']);
const kept = (o: Order, v: number) => Math.round((v * (o.total_pence - o.refunded_pence)) / Math.max(o.total_pence, 1));

export async function breakdown(range?: { from?: Date; to?: Date }): Promise<Breakdown> {
  const db = await getDb();
  const inR = (iso: string | null) => !!iso && (!range?.from || new Date(iso) >= range.from) && (!range?.to || new Date(iso) <= range.to);
  const orders = (await db.select<Order>('orders')).filter((o) => PAID.has(o.payment_status) && inR(o.paid_at));
  const tx = (await db.select<Transaction>('transactions')).filter((t) => inR(t.created_at));
  const expenses = (await db.select<{ amount_pence: number; incurred_on: string }>('platform_expenses')).filter((e) => inR(e.incurred_on));
  const sum = (f: (o: Order) => number) => orders.reduce((s, o) => s + f(o), 0);
  const commission = sum((o) => kept(o, o.application_fee_pence - (o.commission_vat_pence ?? 0)));
  const subs = tx.filter((t) => t.kind === 'membership_payment').reduce((s, t) => s + t.amount_pence, 0);
  const actual = sum((o) => o.stripe_fee_pence ?? 0);
  const missing = orders.filter((o) => o.stripe_fee_pence === null || o.stripe_fee_pence === undefined);
  const estimated = missing.reduce((s, o) => s + estimateProcessingFee(o.total_pence), 0);
  const other = expenses.reduce((s, e) => s + e.amount_pence, 0);
  const taxable = commission + subs;
  return {
    paid_orders: orders.length,
    food_sales_pence: sum((o) => o.subtotal_pence - o.discount_funded_by_restaurant_pence),
    delivery_charges_pence: sum((o) => o.delivery_fee_pence),
    tips_pence: sum((o) => o.tip_pence ?? 0),
    gross_customer_payments_pence: sum((o) => o.total_pence),
    refunds_pence: sum((o) => o.refunded_pence),
    restaurant_allocation_pence: sum((o) => kept(o, o.restaurant_net_pence)),
    platform_commission_pence: commission,
    platform_vat_on_commission_pence: sum((o) => kept(o, o.commission_vat_pence ?? 0)),
    membership_revenue_pence: subs,
    platform_taxable_revenue_pence: taxable,
    processing_fees_actual_pence: actual,
    processing_fees_estimated_pence: estimated,
    orders_missing_fee_data: missing.length,
    other_stripe_costs_pence: other,
    net_contribution_pence: taxable - actual - estimated - other,
    disputes_open: tx.filter((t) => t.kind === 'dispute' && t.status === 'open').length,
    disputes_lost_pence: 0,
  };
}

export interface AdminOverview {
  restaurants_registered: number; restaurants_active: number;
  orders_today: number; orders_week: number; orders_month: number;
  orders_completed: number; orders_cancelled: number;
  avg_food_order_pence: number; returning_customers: number; customers_with_orders: number;
  by_city: { city: string; orders: number; food_sales_pence: number; commission_pence: number }[];
  top_restaurants: { id: string; name: string; orders: number; food_sales_pence: number }[];
  month: Breakdown; all_time: Breakdown;
}

export async function adminOverview(now = new Date()): Promise<AdminOverview> {
  const db = await getDb();
  const [orders, rests] = await Promise.all([db.select<Order>('orders'), db.select<Restaurant>('restaurants')]);
  const paid = orders.filter((o) => PAID.has(o.payment_status));
  const since = (ms: number) => paid.filter((o) => o.paid_at && now.getTime() - new Date(o.paid_at).getTime() <= ms).length;
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const byCust = new Map<string, number>(); paid.forEach((o) => byCust.set(o.customer_id, (byCust.get(o.customer_id) ?? 0) + 1));
  const rName = new Map(rests.map((r) => [r.id, r]));
  const city = new Map<string, { orders: number; food: number; comm: number }>();
  const top = new Map<string, { orders: number; food: number }>();
  for (const o of paid) {
    const r = rName.get(o.restaurant_id); const c = r?.city_slug ?? 'unknown';
    const a = city.get(c) ?? { orders: 0, food: 0, comm: 0 }; a.orders++; a.food += o.subtotal_pence - o.discount_funded_by_restaurant_pence; a.comm += kept(o, o.application_fee_pence - (o.commission_vat_pence ?? 0)); city.set(c, a);
    const t = top.get(o.restaurant_id) ?? { orders: 0, food: 0 }; t.orders++; t.food += o.subtotal_pence; top.set(o.restaurant_id, t);
  }
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    restaurants_registered: rests.length, restaurants_active: rests.filter((r) => r.status === 'approved' && r.stripe_charges_enabled && r.accepting_orders !== false).length,
    orders_today: paid.filter((o) => o.paid_at && new Date(o.paid_at) >= startOfDay).length, orders_week: since(7 * 864e5), orders_month: since(30 * 864e5),
    orders_completed: orders.filter((o) => o.status === 'completed').length, orders_cancelled: orders.filter((o) => ['cancelled', 'rejected'].includes(o.status)).length,
    avg_food_order_pence: paid.length ? Math.round(paid.reduce((s, o) => s + o.subtotal_pence, 0) / paid.length) : 0,
    returning_customers: [...byCust.values()].filter((n) => n > 1).length, customers_with_orders: byCust.size,
    by_city: [...city].map(([c, a]) => ({ city: c, orders: a.orders, food_sales_pence: a.food, commission_pence: a.comm })).sort((a, b) => b.orders - a.orders),
    top_restaurants: [...top].map(([id, t]) => ({ id, name: rName.get(id)?.name ?? '—', orders: t.orders, food_sales_pence: t.food })).sort((a, b) => b.orders - a.orders).slice(0, 5),
    month: await breakdown({ from: monthStart }), all_time: await breakdown(),
  };
}
export type { Profile };

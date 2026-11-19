import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, Notice, Stat } from '@/components/ui';
import { fmt } from '@/lib/money';
import { adminOverview, type Breakdown } from '@/lib/services/reports';
import { vatStatus } from '@/lib/services/vat';
import { getSettings } from '@/lib/services/settings';
import { getDb } from '@/lib/db';
import { cityBySlug } from '@/lib/cities';
import type { Restaurant } from '@/lib/types';
export const metadata: Metadata = { title: 'Admin overview' };
export const dynamic = 'force-dynamic';

function Money({ b, title }: { b: Breakdown; title: string }) {
  const row = (l: string, v: string, note?: string, bold = false) => <tr className={bold ? 'font-semibold text-navy' : ''}><td className="py-1.5 pr-3">{l}{note && <span className="block text-xs font-normal text-muted">{note}</span>}</td><td className="py-1.5 text-right tabular-nums">{v}</td></tr>;
  return (
    <Card className="p-5">
      <h3 className="font-display text-lg font-semibold text-navy">{title}</h3>
      <table className="mt-2 w-full text-sm"><tbody className="divide-y divide-line">
        <tr><td colSpan={2} className="pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Customer money — passes through to restaurants</td></tr>
        {row('Food sales', fmt(b.food_sales_pence))}{row('Delivery charges', fmt(b.delivery_charges_pence))}{row('Tips', fmt(b.tips_pence))}
        {row('Gross customer payments', fmt(b.gross_customer_payments_pence), 'Not FeastQuarter revenue', true)}
        {row('Refunds', `−${fmt(b.refunds_pence)}`)}
        {row('Restaurant allocation (estimate)', fmt(b.restaurant_allocation_pence), 'Due to restaurants after commission & refunds. Confirmed only by Stripe payouts.')}
        <tr><td colSpan={2} className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">FeastQuarter income</td></tr>
        {row('Commission kept (net of refunds, excl. VAT)', fmt(b.platform_commission_pence))}{row('FeastQuarter Plus subscriptions', fmt(b.membership_revenue_pence))}
        {row('Platform taxable revenue', fmt(b.platform_taxable_revenue_pence), 'The figure that counts towards the VAT threshold', true)}
        {b.platform_vat_on_commission_pence > 0 && row('VAT included in commission', fmt(b.platform_vat_on_commission_pence))}
        <tr><td colSpan={2} className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">Costs borne by FeastQuarter</td></tr>
        {row('Stripe processing — actual', `−${fmt(b.processing_fees_actual_pence)}`, 'From Stripe balance transactions')}
        {b.orders_missing_fee_data > 0 && row(`Stripe processing — ESTIMATED (${b.orders_missing_fee_data} order${b.orders_missing_fee_data === 1 ? '' : 's'} not yet reconciled)`, `−${fmt(b.processing_fees_estimated_pence)}`, 'Illustrative 1.5% + 20p until actual fees arrive')}
        {row('Other Stripe / Connect costs', `−${fmt(b.other_stripe_costs_pence)}`, 'Entered manually from Stripe invoices (Finance)')}
        {row('Net contribution', fmt(b.net_contribution_pence), 'Before refunds you absorb, lost disputes, tax and running costs', true)}
      </tbody></table>
    </Card>
  );
}

export default async function AdminHome() {
  const [o, vat, settings] = await Promise.all([adminOverview(), vatStatus(), getSettings()]);
  const pending = (await (await getDb()).select<Restaurant>('restaurants', { status: 'pending' }));
  return (
    <div className="space-y-6">
      {pending.length > 0 && <Notice tone="gold"><strong>{pending.length} restaurant application{pending.length === 1 ? '' : 's'} awaiting review.</strong> <Link href="/admin/restaurants" className="underline">Review now</Link></Notice>}
      {vat.level !== 'ok' && !vat.registered && <Notice tone={vat.level === 'watch' ? 'gold' : 'red'}><strong>VAT threshold: {(vat.pct * 100).toFixed(0)}% used.</strong> {vat.message}</Notice>}
      <section aria-labelledby="ops"><h2 id="ops" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Activity</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Restaurants" value={`${o.restaurants_active} / ${o.restaurants_registered}`} sub="active / registered" /><Stat label="Orders today" value={String(o.orders_today)} sub={`${o.orders_week} this week · ${o.orders_month} last 30 days`} />
          <Stat label="Completed / cancelled" value={`${o.orders_completed} / ${o.orders_cancelled}`} /><Stat label="Avg food order" value={fmt(o.avg_food_order_pence)} sub={`${o.returning_customers} of ${o.customers_with_orders} customers have reordered`} />
        </div></section>
      <section aria-labelledby="hl"><h2 id="hl" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">This month — headline</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Gross customer payments" value={fmt(o.month.gross_customer_payments_pence)} sub="Volume — mostly belongs to restaurants" /><Stat tone="gold" label="FeastQuarter taxable revenue" value={fmt(o.month.platform_taxable_revenue_pence)} sub="Commission + subscriptions" />
          <Stat label="Stripe processing" value={fmt(o.month.processing_fees_actual_pence + o.month.processing_fees_estimated_pence)} sub={o.month.orders_missing_fee_data ? 'includes estimates' : 'actual'} /><Stat label="Net contribution" value={fmt(o.month.net_contribution_pence)} sub="After processing & other Stripe costs" />
        </div></section>
      <div className="grid gap-4 lg:grid-cols-2"><Money b={o.month} title="This month" /><Money b={o.all_time} title="All time" /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5"><h3 className="font-display text-lg font-semibold text-navy">By city</h3>
          <ul className="mt-2 divide-y divide-line text-sm">{o.by_city.length === 0 && <li className="py-2 text-muted">No paid orders yet.</li>}{o.by_city.map((c) => <li key={c.city} className="flex justify-between py-2"><span className="font-medium text-navy">{cityBySlug(c.city)?.name ?? c.city}</span><span className="text-muted">{c.orders} orders · food {fmt(c.food_sales_pence)} · commission {fmt(c.commission_pence)}</span></li>)}</ul></Card>
        <Card className="p-5"><h3 className="font-display text-lg font-semibold text-navy">Most active restaurants</h3>
          <ul className="mt-2 divide-y divide-line text-sm">{o.top_restaurants.length === 0 && <li className="py-2 text-muted">No paid orders yet.</li>}{o.top_restaurants.map((r) => <li key={r.id} className="flex justify-between py-2"><span className="font-medium text-navy">{r.name}</span><span className="text-muted">{r.orders} orders · {fmt(r.food_sales_pence)}</span></li>)}</ul></Card>
      </div>
      <Card className="space-y-1 p-4 text-xs text-muted">
        <p><Badge tone="grey">VAT</Badge> FeastQuarter VAT status: <strong>{settings.platform_vat_registered ? 'registered' : 'not registered'}</strong>. Rolling 12-month taxable income {fmt(vat.income_pence)} of {fmt(vat.threshold_pence)} ({(vat.pct * 100).toFixed(1)}%). {settings.platform_vat_registered ? '' : 'No VAT is added to commission.'}</p>
        <p>Figures are operational reports computed from Stripe-confirmed orders and transactions, not statutory accounts. Restaurant allocation is an estimate until Stripe payouts confirm it. Reconcile with Stripe and your accountant.</p>
      </Card>
    </div>
  );
}

import type { Metadata } from 'next';
import { Badge, Card, Notice } from '@/components/ui';
import { listCouriers } from '@/lib/couriers';
import { getDb } from '@/lib/db';
import { fmt } from '@/lib/money';
export const metadata: Metadata = { title: 'Couriers — Admin' };
export const dynamic = 'force-dynamic';

export default async function Couriers() {
  const bookings = await (await getDb()).select<{ id: string; provider: string; status: string; actual_cost_pence: number | null; subsidy_pence: number }>('delivery_bookings');
  const cost = bookings.reduce((s, b) => s + (b.actual_cost_pence ?? 0), 0), subsidy = bookings.reduce((s, b) => s + b.subsidy_pence, 0);
  return (
    <div className="max-w-3xl space-y-5">
      <Card className="p-6"><h2 className="font-display text-2xl font-semibold text-navy">Courier integrations</h2>
        <div className="mt-3"><Notice tone="gold"><strong>All third-party couriers are disabled at launch.</strong> Delivery is by each restaurant&apos;s own drivers, or customer collection. No courier is booked, quoted or simulated, and no courier availability or pricing is assumed for any city.</Notice></div>
        <ul className="mt-4 divide-y divide-line">{listCouriers().map((c) => <li key={c.id} className="py-3 text-sm"><strong className="text-navy">{c.name}</strong> <Badge tone={c.enabled ? 'green' : 'grey'}>{c.enabled ? 'Enabled' : 'Disabled'}</Badge><p className="mt-1 text-xs text-muted">{c.reason}</p></li>)}</ul></Card>
      <Card className="p-6"><h3 className="font-display text-xl font-semibold text-navy">Provider cost reporting</h3>
        <p className="mt-1 text-sm text-muted">{bookings.length} bookings · provider cost {fmt(cost)} · FeastQuarter subsidy {fmt(subsidy)}. No subsidy applies unless expressly authorised.</p></Card>
    </div>
  );
}

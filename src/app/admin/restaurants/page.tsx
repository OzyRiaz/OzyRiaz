import type { Metadata } from 'next';
import { Badge, Card, DemoBadge } from '@/components/ui';
import { getDb } from '@/lib/db';
import type { Restaurant } from '@/lib/types';
import { featureAction, restaurantStatusAction } from '../actions';
export const metadata: Metadata = { title: 'Restaurants — Admin' };
export const dynamic = 'force-dynamic';

const Btn = ({ id, to, label, tone = 'navy' }: { id: string; to: string; label: string; tone?: 'navy' | 'red' | 'green' }) => (
  <form action={restaurantStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value={to} /><button className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${tone === 'red' ? 'bg-danger' : tone === 'green' ? 'bg-ok' : 'bg-navy'}`}>{label}</button></form>);

export default async function AdminRestaurants() {
  const list = (await (await getDb()).select<Restaurant>('restaurants', {}, { order: ['created_at', 'desc'] })).sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
  return (
    <div className="space-y-3">
      <h2 className="font-display text-2xl font-semibold text-navy">Restaurants</h2>
      {list.map((r) => (
        <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0"><p className="flex flex-wrap items-center gap-2 font-semibold text-navy">{r.name} {r.is_demo && <DemoBadge />}<Badge tone={r.status === 'approved' ? 'green' : r.status === 'pending' ? 'gold' : 'red'}>{r.status}</Badge>{r.featured && <Badge tone="navy">Featured</Badge>}</p>
            <p className="text-sm text-muted">{r.cuisines.join(', ')} · {r.address_line1}, {r.postcode} · {r.email}</p>
            <p className="text-xs text-muted">Stripe: {r.stripe_charges_enabled ? 'charges on' : 'charges off'} · {r.stripe_payouts_enabled ? 'payouts on' : 'payouts off'}</p></div>
          <div className="flex flex-wrap gap-2">
            {r.status === 'pending' && <><Btn id={r.id} to="approved" label="Approve" tone="green" /><Btn id={r.id} to="rejected" label="Reject" tone="red" /></>}
            {r.status === 'approved' && <><Btn id={r.id} to="suspended" label="Suspend" tone="red" /><form action={featureAction}><input type="hidden" name="id" value={r.id} /><button className="rounded-lg border border-navy/25 px-3 py-1.5 text-xs font-semibold text-navy">{r.featured ? 'Unfeature' : 'Feature'}</button></form></>}
            {(r.status === 'suspended' || r.status === 'rejected') && <Btn id={r.id} to="approved" label="Reinstate" tone="green" />}
          </div>
        </Card>
      ))}
    </div>
  );
}

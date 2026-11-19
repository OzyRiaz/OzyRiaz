import type { Metadata } from 'next';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Badge, Card, Field, Input, Notice } from '@/components/ui';
import { getDb } from '@/lib/db';
import { getCities } from '@/lib/services/cities';
import type { Order, Restaurant } from '@/lib/types';
import { setCityActiveAction, upsertCityAction } from '../actions';
export const metadata: Metadata = { title: 'Locations — Admin' };
export const dynamic = 'force-dynamic';

export default async function Locations() {
  const [cities, rests, orders] = await Promise.all([getCities(), (await getDb()).select<Restaurant>('restaurants'), (await getDb()).select<Order>('orders')]);
  return (
    <div className="max-w-3xl space-y-5">
      <Card className="p-6"><h2 className="font-display text-2xl font-semibold text-navy">Locations</h2>
        <div className="mt-3"><Notice tone="navy">Customers can only order in <strong>active</strong> cities. Restaurants in any recognised postcode area can apply through the same form; they go live when you approve them <em>and</em> the city is active. New cities start inactive.</Notice></div>
        <ul className="mt-4 divide-y divide-line">{cities.map((c) => (
          <li key={c.slug} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <span><strong className="text-navy">{c.name}</strong> <Badge tone={c.active ? 'green' : 'grey'}>{c.active ? 'Live' : 'Not live'}</Badge><br /><span className="text-muted">Postcode areas: {c.areas.join(', ')} · {rests.filter((r) => r.city_slug === c.slug).length} restaurants · {orders.filter((o) => rests.find((r) => r.id === o.restaurant_id)?.city_slug === c.slug).length} orders</span></span>
            <form action={setCityActiveAction}><input type="hidden" name="slug" value={c.slug} /><input type="hidden" name="active" value={c.active ? 'false' : 'true'} /><button className="rounded-lg border border-navy/25 px-3 py-1.5 text-xs font-semibold text-navy">{c.active ? 'Deactivate' : 'Activate'}</button></form>
          </li>))}</ul></Card>
      <Card className="p-6"><h3 className="font-display text-xl font-semibold text-navy">Add or edit a city</h3>
        <ActionForm action={upsertCityAction} className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Name"><Input name="name" placeholder="Leeds" required /></Field><Field label="Slug" hint="lowercase, e.g. leeds"><Input name="slug" required /></Field><Field label="Postcode areas" hint="Comma separated, e.g. LS"><Input name="areas" required /></Field>
          <div className="sm:col-span-3"><Submit variant="outline">Save city</Submit></div></ActionForm></Card>
    </div>
  );
}

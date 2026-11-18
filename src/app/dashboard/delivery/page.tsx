import type { Metadata } from 'next';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Card, Field, Input } from '@/components/ui';
import { requireSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { fmt } from '@/lib/money';
import type { DeliveryArea, Restaurant } from '@/lib/types';
import { addAreaAction, deleteAreaAction, saveFulfilmentAction } from '../actions';
export const metadata: Metadata = { title: 'Delivery — Dashboard' };

export default async function Delivery() {
  const s = await requireSession('/dashboard');
  const db = await getDb();
  const [r, areas] = await Promise.all([db.get<Restaurant>('restaurants', { id: s.restaurantIds[0] }), db.select<DeliveryArea>('delivery_areas', { restaurant_id: s.restaurantIds[0] })]);
  return (
    <div className="max-w-3xl space-y-5">
      <Card className="p-6">
        <h2 className="font-display text-2xl font-semibold text-navy">Delivery & collection</h2>
        <p className="mt-1 text-sm text-muted">You deliver with your own drivers and set your own charges. FeastQuarter doesn&apos;t supply drivers.</p>
        <ActionForm action={saveFulfilmentAction} className="mt-4 flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 font-semibold text-navy"><input type="checkbox" name="delivery" defaultChecked={r!.delivery_enabled} className="h-5 w-5 accent-[#132c39]" />Offer delivery</label>
          <label className="flex items-center gap-2 font-semibold text-navy"><input type="checkbox" name="collection" defaultChecked={r!.collection_enabled} className="h-5 w-5 accent-[#132c39]" />Offer collection</label>
          <Submit variant="outline">Save</Submit>
        </ActionForm>
      </Card>
      <Card className="p-6">
        <h3 className="font-display text-xl font-semibold text-navy">Delivery areas</h3>
        <ul className="mt-3 divide-y divide-line">
          {areas.length === 0 && <li className="py-2 text-sm text-muted">No delivery areas yet — customers can only collect.</li>}
          {areas.map((a) => <li key={a.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span><strong className="text-navy">{a.name}</strong><br /><span className="text-muted">{a.postcode_prefixes.join(', ')} · charge {fmt(a.fee_pence)}{a.min_order_pence ? ` · min ${fmt(a.min_order_pence)}` : ''}</span></span>
            <form action={deleteAreaAction}><input type="hidden" name="id" value={a.id} /><button className="text-danger hover:underline" aria-label={`Remove ${a.name}`}>Remove</button></form></li>)}
        </ul>
        <ActionForm action={addAreaAction} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <Field label="Area name"><Input name="name" placeholder="Central area" required /></Field>
          <Field label="Postcodes" hint="Outward codes (BD5, BD7) or sectors (BD5 0), separated by commas"><Input name="prefixes" placeholder="BD1, BD3, BD5" required /></Field>
          <Field label="Delivery charge (£)"><Input name="fee" inputMode="decimal" placeholder="2.50" required /></Field>
          <Field label="Minimum order here (£, optional)"><Input name="min" inputMode="decimal" placeholder="15.00" /></Field>
          <div className="sm:col-span-2"><Submit>Add delivery area</Submit></div>
        </ActionForm>
      </Card>
    </div>
  );
}

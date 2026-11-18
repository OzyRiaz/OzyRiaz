import type { Metadata } from 'next';
import { ActionForm, Submit } from '@/components/ActionForm';
import { ImageUpload } from '@/components/ImageUpload';
import { Card, Field, Input, Textarea } from '@/components/ui';
import { requireSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { DAY_KEYS } from '@/lib/hours';
import type { Restaurant } from '@/lib/types';
import { saveProfileAction } from '../actions';
export const metadata: Metadata = { title: 'Profile — Dashboard' };

export default async function Profile() {
  const s = await requireSession('/dashboard');
  const r = (await (await getDb()).get<Restaurant>('restaurants', { id: s.restaurantIds[0] }))!;
  return (
    <Card className="max-w-3xl p-6">
      <h2 className="font-display text-2xl font-semibold text-navy">Profile & opening hours</h2>
      <ActionForm action={saveProfileAction} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Restaurant name"><Input name="name" defaultValue={r.name} required /></Field>
          <Field label="Cuisines" hint="Comma separated"><Input name="cuisines" defaultValue={r.cuisines.join(', ')} required /></Field>
          <div className="sm:col-span-2"><Field label="Description"><Textarea name="description" rows={2} defaultValue={r.description} required /></Field></div>
          <Field label="Address"><Input name="address_line1" defaultValue={r.address_line1} required /></Field>
          <Field label="Postcode"><Input name="postcode" defaultValue={r.postcode} required /></Field>
          <Field label="Phone"><Input name="phone" type="tel" defaultValue={r.phone ?? ''} required /></Field>
          <Field label="Order email" hint="New-order notifications go here"><Input name="email" type="email" defaultValue={r.email ?? ''} required /></Field>
          <Field label="Typical prep time (minutes)"><Input name="prep_minutes" type="number" min={5} max={120} defaultValue={r.prep_minutes} required /></Field>
          <Field label="Minimum food order (£)"><Input name="min_order" inputMode="decimal" defaultValue={(r.min_order_pence / 100).toFixed(2)} required /></Field>
        </div>
        <div><p className="mb-1.5 text-sm font-semibold text-navy">Cover image</p><ImageUpload name="image_url" restaurantId={r.id} initial={r.image_url} cuisine={r.cuisines[0]} /></div>
        <fieldset><legend className="text-sm font-semibold text-navy">Opening hours</legend>
          <div className="mt-2 space-y-2">{DAY_KEYS.map((d) => { const p = r.opening_hours[d][0]; return (
            <div key={d} className="grid grid-cols-[3rem_1fr_1fr_auto] items-center gap-2 text-sm"><span className="font-semibold capitalize text-navy">{d}</span>
              <Input type="time" name={`${d}_open`} defaultValue={p?.open ?? '12:00'} aria-label={`${d} opens`} /><Input type="time" name={`${d}_close`} defaultValue={p?.close ?? '22:00'} aria-label={`${d} closes`} />
              <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" name={`${d}_closed`} defaultChecked={!p} className="h-4 w-4 accent-[#132c39]" />Closed</label></div>); })}</div>
        </fieldset>
        <Submit variant="gold">Save changes</Submit>
      </ActionForm>
    </Card>
  );
}

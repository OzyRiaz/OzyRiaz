import type { Metadata } from 'next';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Card, Field, Input, Notice } from '@/components/ui';
import { requireSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { getSettings } from '@/lib/services/settings';
import type { Restaurant } from '@/lib/types';
import { saveOfferAction } from '../actions';
export const metadata: Metadata = { title: 'Member offers — Dashboard' };

export default async function Offers() {
  const s = await requireSession('/dashboard');
  const [r, settings] = await Promise.all([(await getDb()).get<Restaurant>('restaurants', { id: s.restaurantIds[0] }), getSettings()]);
  const o = r!.member_offer;
  return (
    <Card className="max-w-2xl p-6">
      <h2 className="font-display text-2xl font-semibold text-navy">FeastQuarter Plus member offer</h2>
      {!settings.feature_plus_enabled && <div className="mt-3"><Notice tone="gold">FeastQuarter Plus is not live yet, so member offers are saved but not shown or applied to customers.</Notice></div>}
      <p className="mt-1 text-sm text-muted">Give FeastQuarter Plus members a percentage off food. {settings.member_discount_funding === 'restaurant' ? 'The discount is funded by you: it reduces what you receive and the commission base.' : 'The discount is funded by FeastQuarter from its commission, up to the commission on that order.'}</p>
      <div className="mt-3"><Notice tone="navy">Platform cap: member discounts are limited to <strong>{settings.member_discount_max_percent}%</strong>. Offers are never shown as “was/now” prices.</Notice></div>
      <ActionForm action={saveOfferAction} className="mt-4 space-y-4">
        <label className="flex items-center gap-2 font-semibold text-navy"><input type="checkbox" name="enabled" defaultChecked={o.enabled} className="h-5 w-5 accent-[#132c39]" />Offer a member discount</label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Discount (%)"><Input name="percent" type="number" min={0} max={50} step="1" defaultValue={o.percent} required /></Field>
          <Field label="Minimum food spend (£)"><Input name="min" inputMode="decimal" defaultValue={(o.min_spend_pence / 100).toFixed(2)} required /></Field>
        </div>
        <Field label="Internal note (optional)"><Input name="description" defaultValue={o.description} maxLength={120} /></Field>
        <Submit variant="gold">Save offer</Submit>
      </ActionForm>
    </Card>
  );
}

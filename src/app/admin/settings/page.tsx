import type { Metadata } from 'next';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Card, Field, Input, Notice, Select, Textarea } from '@/components/ui';
import { getSettings } from '@/lib/services/settings';
import { saveSettingsAction } from '../actions';
export const metadata: Metadata = { title: 'Settings — Admin' };
export const dynamic = 'force-dynamic';

export default async function Settings() {
  const s = await getSettings();
  return (
    <Card className="max-w-2xl p-6">
      <h2 className="font-display text-2xl font-semibold text-navy">Commission & membership</h2>
      <ActionForm action={saveSettingsAction} className="mt-4 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Delivery order commission (%)" hint="On food subtotal, not delivery fee"><Input name="delivery" type="number" step="0.1" min={0} max={30} defaultValue={s.commission_delivery_bps / 100} required /></Field>
          <Field label="Collection order commission (%)"><Input name="collection" type="number" step="0.1" min={0} max={30} defaultValue={s.commission_collection_bps / 100} required /></Field>
          <Field label="BD Feast Plus price (£ / month)" hint="Applies to new subscribers"><Input name="price" inputMode="decimal" defaultValue={(s.membership_price_pence / 100).toFixed(2)} required /></Field>
          <Field label="Maximum member discount (%)" hint="Caps every restaurant's member offer"><Input name="maxp" type="number" min={0} max={50} defaultValue={s.member_discount_max_percent} required /></Field>
          <Field label="Who funds member discounts?" hint="Platform-funded discounts come out of commission and can't exceed it"><Select name="funding" defaultValue={s.member_discount_funding}><option value="restaurant">Restaurant (default)</option><option value="platform">BD Feast</option></Select></Field>
        </div>
        <Field label="Membership benefits (one per line, shown to customers)" hint="Only list benefits that are really delivered. Do not promise free delivery unless funded."><Textarea name="benefits" rows={5} defaultValue={s.membership_benefits.join('\n')} /></Field>
        <Notice tone="navy">If <code>STRIPE_MEMBERSHIP_PRICE_ID</code> is set, Stripe bills that Price — update it in Stripe too. Leave it empty to bill the price above.</Notice>
        <Submit variant="gold">Save settings</Submit>
      </ActionForm>
    </Card>
  );
}

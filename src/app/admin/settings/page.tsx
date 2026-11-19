import type { Metadata } from 'next';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Badge, Card, Field, Input, Notice, Select, Textarea } from '@/components/ui';
import { getDb } from '@/lib/db';
import { getSettings } from '@/lib/services/settings';
import type { Profile } from '@/lib/types';
import { saveSettingsAction } from '../actions';
export const metadata: Metadata = { title: 'Settings — Admin' };
export const dynamic = 'force-dynamic';

interface Audit { id: string; changed_by: string; field: string; old_value: string; new_value: string; reason: string; created_at: string }

export default async function Settings() {
  const s = await getSettings();
  const db = await getDb();
  const [audit, people] = await Promise.all([db.select<Audit>('settings_audit', {}, { order: ['created_at', 'desc'], limit: 25 }), db.select<Profile>('profiles', { role: 'admin' })]);
  const who = new Map(people.map((p) => [p.id, p.full_name]));
  return (
    <div className="max-w-3xl space-y-5">
      <Card className="p-6">
        <h2 className="font-display text-2xl font-semibold text-navy">Commission, VAT & features</h2>
        <ActionForm action={saveSettingsAction} className="mt-4 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Commission on food (%)" hint="Flat rate for delivery AND collection. Includes standard card processing. Excludes delivery fees and tips."><Input name="commission" type="number" step="0.1" min={0} max={30} defaultValue={s.commission_bps / 100} required /></Field>
            <Field label="Reason for any change" hint="Required when you change commission, VAT or feature settings. Recorded in the audit log."><Input name="reason" maxLength={300} placeholder="e.g. launch terms agreed" /></Field>
          </div>
          <Notice tone="navy">Changing the commission affects <strong>new orders only</strong>. Every order stores the rate it was placed at, so historical orders never change.</Notice>

          <fieldset className="space-y-3 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-navy">FeastQuarter VAT (platform)</legend>
            <label className="flex items-center gap-2 text-sm font-semibold text-navy"><input type="checkbox" name="vat_registered" defaultChecked={s.platform_vat_registered} className="h-5 w-5 accent-[#132c39]" />FeastQuarter is VAT registered</label>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Registration threshold (£)" hint="Rolling 12 months. Confirm the current HMRC figure."><Input name="vat_threshold" inputMode="decimal" defaultValue={(s.vat_threshold_pence / 100).toFixed(2)} required /></Field>
              <Field label="VAT rate (%)"><Input name="vat_rate" type="number" step="0.1" min={0} max={30} defaultValue={s.vat_rate_bps / 100} required /></Field>
              <Field label="VAT on commission (only if registered)" hint="Inclusive = 10% already contains VAT. Exclusive = VAT added on top."><Select name="vat_mode" defaultValue={s.commission_vat_mode}><option value="none">None</option><option value="inclusive">Inclusive</option><option value="exclusive">Exclusive</option></Select></Field>
            </div>
            <p className="text-xs text-muted">While not registered, no VAT is ever added to commission. Restaurants record their own VAT status separately. This is plumbing for a future registration, not a statement of the legal VAT treatment — see the production readiness checklist.</p>
          </fieldset>

          <fieldset className="space-y-3 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-navy">FeastQuarter Plus (membership)</legend>
            <label className="flex items-center gap-2 text-sm font-semibold text-navy"><input type="checkbox" name="plus_enabled" defaultChecked={s.feature_plus_enabled} className="h-5 w-5 accent-[#132c39]" />Enable FeastQuarter Plus publicly <Badge tone={s.feature_plus_enabled ? 'green' : 'grey'}>{s.feature_plus_enabled ? 'ON' : 'OFF at launch'}</Badge></label>
            <p className="text-xs text-muted">Leave OFF until the owner has authorised the launch of membership. Existing membership records are preserved either way.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price (£ / month)"><Input name="price" inputMode="decimal" defaultValue={(s.membership_price_pence / 100).toFixed(2)} required /></Field>
              <Field label="Maximum member discount (%)"><Input name="maxp" type="number" min={0} max={50} defaultValue={s.member_discount_max_percent} required /></Field>
              <Field label="Who funds member discounts?"><Select name="funding" defaultValue={s.member_discount_funding}><option value="restaurant">Restaurant (default)</option><option value="platform">FeastQuarter</option></Select></Field>
            </div>
            <Field label="Benefits (one per line)"><Textarea name="benefits" rows={4} defaultValue={s.membership_benefits.join('\n')} /></Field>
          </fieldset>
          <Submit variant="gold">Save settings</Submit>
        </ActionForm>
      </Card>
      <Card className="overflow-x-auto p-6">
        <h3 className="font-display text-xl font-semibold text-navy">Settings audit log</h3>
        {audit.length === 0 ? <p className="mt-2 text-sm text-muted">No changes recorded yet.</p> : (
          <table className="mt-3 w-full min-w-[560px] text-left text-sm"><thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="py-2">When</th><th>By</th><th>Field</th><th>Old → New</th><th>Reason</th></tr></thead>
            <tbody className="divide-y divide-line">{audit.map((a) => <tr key={a.id}><td className="py-2 text-xs">{new Date(a.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td><td>{who.get(a.changed_by) ?? 'admin'}</td><td className="font-medium text-navy">{a.field}</td><td className="text-xs">{a.old_value} → {a.new_value}</td><td className="text-xs text-muted">{a.reason}</td></tr>)}</tbody></table>)}
      </Card>
    </div>
  );
}

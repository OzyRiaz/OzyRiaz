import type { Metadata } from 'next';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Badge, Card, Field, Input, Notice, Select } from '@/components/ui';
import { getDb } from '@/lib/db';
import { fmt } from '@/lib/money';
import { getCities } from '@/lib/services/cities';
import type { Promotion } from '@/lib/types';
import { createPromoAction, togglePromoAction } from '../actions';
export const metadata: Metadata = { title: 'Promotions — Admin' };
export const dynamic = 'force-dynamic';

export default async function Promotions() {
  const promos = await (await getDb()).select<Promotion>('promotions', {}, { order: ['created_at', 'desc'] });
  const cities = await getCities();
  return (
    <div className="max-w-3xl space-y-5">
      <Card className="p-6"><h2 className="font-display text-2xl font-semibold text-navy">Promotional codes</h2>
        <div className="mt-3"><Notice tone="navy">One discount per order (the larger of member offer or code). <strong>Platform-funded</strong> codes are paid from commission and can&apos;t exceed the commission on that order — a £5 code on a £10 collection order only gives £0.50. Use <strong>restaurant-funded</strong> only with that restaurant&apos;s agreement.</Notice></div>
        <ul className="mt-4 divide-y divide-line">{promos.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span><strong className="text-navy">{p.code}</strong> <Badge tone={p.active ? 'green' : 'grey'}>{p.active ? 'Active' : 'Off'}</Badge><br /><span className="text-muted">{p.kind === 'percent' ? `${p.value}%` : fmt(p.value)} off · min {fmt(p.min_spend_pence)} · {p.funded_by}-funded · used {p.used_count}{p.max_uses ? `/${p.max_uses}` : ''}{p.ends_at ? ` · ends ${new Date(p.ends_at).toLocaleDateString('en-GB')}` : ''}</span></span>
          <form action={togglePromoAction}><input type="hidden" name="id" value={p.id} /><button className="rounded-lg border border-navy/25 px-3 py-1.5 text-xs font-semibold text-navy">{p.active ? 'Disable' : 'Enable'}</button></form></li>)}</ul></Card>
      <Card className="p-6"><h3 className="font-display text-xl font-semibold text-navy">Create promotion</h3>
        <ActionForm action={createPromoAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Code"><Input name="code" placeholder="WELCOME10" required /></Field><Field label="Description (shown to customers)"><Input name="description" required /></Field>
          <Field label="Type"><Select name="kind"><option value="percent">Percentage</option><option value="fixed">Fixed £</option></Select></Field><Field label="Value" hint="% or £ amount"><Input name="value" inputMode="decimal" required /></Field>
          <Field label="Minimum spend (£)"><Input name="min" inputMode="decimal" defaultValue="0" /></Field><Field label="Max total uses (optional)"><Input name="max_uses" type="number" min={1} /></Field>
          <Field label="City (optional)"><Select name="city"><option value="">Any city</option>{cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select></Field>
          <Field label="Ends (optional)"><Input name="ends" type="date" /></Field><Field label="Funded by"><Select name="funded_by"><option value="platform">FeastQuarter (from commission)</option><option value="restaurant">Restaurant</option></Select></Field>
          <div className="sm:col-span-2"><Submit variant="gold">Create code</Submit></div></ActionForm></Card>
    </div>
  );
}

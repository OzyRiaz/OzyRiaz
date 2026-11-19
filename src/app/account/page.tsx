import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Badge, Card, Container, Field, Input, PageTitle } from '@/components/ui';
import { requireSession } from '@/lib/auth/session';
import { addAddressAction, deleteAccountAction, deleteAddressAction, updateProfileAction } from '@/app/actions/customer';
import { getDb } from '@/lib/db';
import { getActiveCities } from '@/lib/services/cities';
import { getSettings } from '@/lib/services/settings';
import { getActiveMembership } from '@/lib/services/membership';
import type { Address, Profile } from '@/lib/types';
export const metadata: Metadata = { title: 'Account' };

export default async function Account() {
  const s = await requireSession('/account');
  const db = await getDb();
  const plusOn = (await getSettings()).feature_plus_enabled;
  const [p, addrs, m] = await Promise.all([db.get<Profile>('profiles', { id: s.userId }), db.select<Address>('addresses', { user_id: s.userId }), getActiveMembership(s.userId)]);
  return (
    <Container className="max-w-3xl py-8">
      <PageTitle title="Your account" sub={s.email} />
      <div className="space-y-5">
        {(plusOn || m) && <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div><h2 className="font-display text-xl font-semibold text-navy">FeastQuarter Plus</h2><p className="text-sm text-muted">{m ? `Active${m.cancel_at_period_end ? ' — ends ' + new Date(m.current_period_end!).toLocaleDateString('en-GB') : m.current_period_end ? ' — renews ' + new Date(m.current_period_end).toLocaleDateString('en-GB') : ''}` : 'Not a member'}</p></div>
          <div className="flex items-center gap-2">{m && <Badge tone="gold">Member</Badge>}<Link href="/plus" className="text-sm font-semibold text-navy underline">Manage</Link></div>
        </Card>}
        <Card className="p-5">
          <h2 className="font-display text-xl font-semibold text-navy">Profile</h2>
          <ActionForm action={updateProfileAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Full name"><Input name="full_name" defaultValue={p?.full_name} required /></Field>
            <Field label="Mobile number"><Input name="phone" type="tel" defaultValue={p?.phone ?? ''} /></Field>
            <div className="sm:col-span-2"><Submit>Save profile</Submit></div>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-xl font-semibold text-navy">Saved addresses</h2>
          <ul className="mt-3 divide-y divide-line">
            {addrs.length === 0 && <li className="py-2 text-sm text-muted">No saved addresses yet.</li>}
            {addrs.map((a) => <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span><strong className="text-navy">{a.label}</strong> — {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city} {a.postcode}</span>
              <form action={deleteAddressAction}><input type="hidden" name="id" value={a.id} /><button className="text-sm font-medium text-danger hover:underline" aria-label={`Delete ${a.label} address`}>Delete</button></form></li>)}
          </ul>
          <ActionForm action={addAddressAction} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <Field label="Label"><Input name="label" placeholder="Home" required /></Field>
            <Field label="Postcode"><Input name="postcode" placeholder="BD5 0AA" autoComplete="postal-code" required /></Field>
            <div className="sm:col-span-2"><Field label="Address line 1"><Input name="line1" autoComplete="address-line1" required /></Field></div>
            <Field label="Address line 2"><Input name="line2" /></Field>
            <Field label="Town / city"><Input name="city" defaultValue={(await getActiveCities())[0]?.name ?? ''} required /></Field>
            <div className="sm:col-span-2"><Submit variant="outline">Add address</Submit></div>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-xl font-semibold text-navy">Your data & privacy</h2>
          <p className="mt-1 text-sm text-muted">Download a copy of your personal data, or permanently delete your account. Financial records are retained in anonymised form where the law requires. See our <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.</p>
          <a href="/api/account/export" className="mt-3 inline-block text-sm font-semibold text-navy underline">Download my data (JSON)</a>
          <ActionForm action={deleteAccountAction} className="mt-5 border-t border-line pt-4">
            <Field label="Delete my account — type DELETE to confirm" hint="This cancels any membership and cannot be undone."><Input name="confirm" placeholder="DELETE" autoComplete="off" /></Field>
            <div className="mt-3"><Submit variant="danger">Delete my account</Submit></div>
          </ActionForm>
        </Card>
      </div>
    </Container>
  );
}

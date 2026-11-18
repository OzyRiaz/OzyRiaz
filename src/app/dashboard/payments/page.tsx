import type { Metadata } from 'next';
import { Badge, Card, Notice } from '@/components/ui';
import { Submit } from '@/components/ActionForm';
import { requireSession } from '@/lib/auth/session';
import { demoPaymentsEnabled } from '@/lib/config';
import { getDb } from '@/lib/db';
import { refreshConnectStatus } from '@/lib/services/connect';
import type { Restaurant } from '@/lib/types';
import { connectOnboardAction } from '../actions';
export const metadata: Metadata = { title: 'Payments — Dashboard' };
export const dynamic = 'force-dynamic';

export default async function Payments({ searchParams }: { searchParams: Promise<{ error?: string; returned?: string }> }) {
  const s = await requireSession('/dashboard');
  const sp = await searchParams;
  let r = (await (await getDb()).get<Restaurant>('restaurants', { id: s.restaurantIds[0] }))!;
  if (sp.returned) r = await refreshConnectStatus(r); // webhook is the source of truth; this just refreshes sooner
  const row = (l: string, ok: boolean) => <li className="flex items-center justify-between py-3 text-sm"><span className="font-medium text-navy">{l}</span><Badge tone={ok ? 'green' : 'gold'}>{ok ? 'Complete' : 'Action needed'}</Badge></li>;
  return (
    <Card className="max-w-2xl p-6">
      <h2 className="font-display text-2xl font-semibold text-navy">Stripe payments & payouts</h2>
      <p className="mt-1 text-sm text-muted">Customer payments go straight to your own Stripe account. FeastQuarter&apos;s commission is deducted automatically at payment time.</p>
      {sp.error && <div className="mt-3"><Notice tone="red">{sp.error}</Notice></div>}
      {demoPaymentsEnabled() && <div className="mt-3"><Notice tone="gold">Demo mode: Stripe isn&apos;t connected. Onboarding is simulated.</Notice></div>}
      <ul className="mt-3 divide-y divide-line">
        {row('Stripe account created', !!r.stripe_account_id)}{row('Business details submitted', r.stripe_details_submitted)}{row('Can accept card payments', r.stripe_charges_enabled)}{row('Payouts to your bank enabled', r.stripe_payouts_enabled)}
      </ul>
      <form action={connectOnboardAction} className="mt-5"><Submit variant="gold">{r.stripe_details_submitted ? 'Update Stripe details' : r.stripe_account_id ? 'Continue Stripe onboarding' : 'Start Stripe onboarding'}</Submit></form>
      {r.status !== 'approved' && <p className="mt-3 text-sm text-muted">Onboarding unlocks once FeastQuarter approves your application.</p>}
    </Card>
  );
}

import { Check, Crown } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Badge, Card, Container, LinkButton, Notice } from '@/components/ui';
import { cancelMembershipAction, demoMembershipAction, joinMembershipAction } from '@/app/actions/customer';
import { getSession } from '@/lib/auth/session';
import { demoPaymentsEnabled } from '@/lib/config';
import { getDb } from '@/lib/db';
import { fmt } from '@/lib/money';
import { getActiveMembership, getMembership } from '@/lib/services/membership';
import { getSettings } from '@/lib/services/settings';
import type { Restaurant } from '@/lib/types';
export const metadata: Metadata = { title: 'FeastQuarter Plus' };
export const dynamic = 'force-dynamic';

export default async function Plus({ searchParams }: { searchParams: Promise<{ status?: string; msg?: string }> }) {
  const sp = await searchParams;
  const [s, settings] = await Promise.all([getSession(), getSettings()]);
  const active = s ? await getActiveMembership(s.userId) : null;
  const any = s ? await getMembership(s.userId) : null;
  const partners = (await (await getDb()).select<Restaurant>('restaurants', { status: 'approved' })).filter((r) => r.member_offer.enabled);
  if (!settings.feature_plus_enabled && !any) {
    // Feature flag OFF (launch default): no purchase path and no promotion.
    return <Container className="max-w-2xl py-16"><Card className="p-8 text-center"><h1 className="font-display text-3xl font-semibold text-navy">FeastQuarter Plus is coming soon</h1><p className="mt-2 text-muted">Membership isn&apos;t available yet. You don&apos;t need it to order — everything else works as normal.</p><div className="mt-5"><LinkButton href="/restaurants">Find food</LinkButton></div></Card></Container>;
  }
  return (
    <Container className="max-w-4xl py-10">
      <div className="rounded-3xl bg-navy p-8 text-white sm:p-12">
        <Badge tone="gold"><Crown size={12} />FeastQuarter Plus</Badge>
        <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">Member offers from restaurants you&apos;ll actually use.</h1>
        <p className="mt-3 text-4xl font-semibold text-gold">{fmt(settings.membership_price_pence)}<span className="text-lg font-normal text-white/70"> / month</span></p>
        <ul className="mt-5 space-y-2">{settings.membership_benefits.map((b) => <li key={b} className="flex gap-2 text-white/85"><Check className="mt-0.5 shrink-0 text-gold" size={18} />{b}</li>)}</ul>
        <div className="mt-7">
          {sp.status === 'success' && <div className="mb-4"><Notice tone="green">Thanks! We&apos;re confirming your membership with our payment provider — your benefits switch on as soon as that confirmation arrives.</Notice></div>}
          {sp.status === 'unavailable' && <div className="mb-4"><Notice tone="gold">{sp.msg ?? 'Memberships are not available right now.'}</Notice></div>}
          {sp.status === 'cancelled' && <div className="mb-4"><Notice tone="gold">Checkout cancelled — you haven&apos;t been charged.</Notice></div>}
          {!settings.feature_plus_enabled && !active ? <p className="font-semibold text-gold">Joining is not open at the moment.</p> : active ? <p className="font-semibold text-gold">✓ You&apos;re a member{active.cancel_at_period_end ? ` — ends ${new Date(active.current_period_end!).toLocaleDateString('en-GB')}` : active.current_period_end ? ` — renews ${new Date(active.current_period_end).toLocaleDateString('en-GB')}` : ''}</p>
            : !s ? <LinkButton href="/login?next=/plus" variant="gold" size="lg">Sign in to join</LinkButton>
            : <form action={demoPaymentsEnabled() ? demoMembershipAction : joinMembershipAction}><Submit variant="gold" size="lg" pendingText="Redirecting…">Join for {fmt(settings.membership_price_pence)}/month</Submit>{demoPaymentsEnabled() && <p className="mt-2 text-xs text-white/60">Demo mode: simulated payment, no charge.</p>}</form>}
          {any?.status === 'past_due' && <div className="mt-3"><Notice tone="red">Your last payment failed. Update your payment method with Stripe to restore benefits.</Notice></div>}
        </div>
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <Card className="p-6"><h2 className="font-display text-xl font-semibold text-navy">What you get — and don&apos;t</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted"><li>✓ Percentage discounts at participating restaurants (up to {settings.member_discount_max_percent}% — set by each restaurant, funded by {settings.member_discount_funding === 'restaurant' ? 'the restaurant' : 'FeastQuarter'}).</li><li>✓ Member-only offers as restaurants add them.</li><li>✗ Not free delivery — delivery charges are set by each restaurant.</li><li>✗ Discounts don&apos;t stack with promo codes; the bigger saving applies.</li></ul></Card>
        <Card className="p-6"><h2 className="font-display text-xl font-semibold text-navy">Participating restaurants ({partners.length})</h2>
          <ul className="mt-3 space-y-2 text-sm">{partners.map((r) => <li key={r.id} className="flex justify-between"><Link className="font-medium text-navy hover:underline" href={`/restaurants/${r.slug}`}>{r.name}</Link><span className="text-muted">{Math.min(r.member_offer.percent, settings.member_discount_max_percent)}% off over {fmt(r.member_offer.min_spend_pence)}</span></li>)}</ul></Card>
      </div>
      {active && !active.cancel_at_period_end && (
        <Card className="mt-6 p-6"><h2 className="font-display text-xl font-semibold text-navy">Cancel membership</h2><p className="mt-1 text-sm text-muted">You keep your benefits until the end of the billing period and won&apos;t be charged again.</p>
          <ActionForm action={cancelMembershipAction} className="mt-3"><Submit variant="outline" pendingText="Cancelling…">Cancel at end of period</Submit></ActionForm></Card>
      )}
      <p className="mt-6 text-xs text-muted">Membership is billed monthly by FeastQuarter through Stripe and renews until cancelled. Terms apply (draft — requires legal review).</p>
    </Container>
  );
}

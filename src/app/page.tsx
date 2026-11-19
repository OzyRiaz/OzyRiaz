import { ArrowRight, Bike, Crown, HandCoins, ShieldCheck, Store } from 'lucide-react';
import Link from 'next/link';
import { DemoBadge, Badge, Card, Container, LinkButton } from '@/components/ui';
import { PostcodeSearch } from '@/components/PostcodeSearch';
import { RestaurantCard } from '@/components/RestaurantCard';
import { artFor } from '@/components/FoodArt';
import { currentPostcode } from '@/lib/postcode-ctx';
import { listCuisines, listRestaurants } from '@/lib/services/restaurants';
import { getSettings } from '@/lib/services/settings';
import { pctLabel, fmt } from '@/lib/money';
import { getDb } from '@/lib/db';
import type { Promotion } from '@/lib/types';
import { isDemo } from '@/lib/config';
import { launchCity } from '@/lib/cities';

export default async function Home({ searchParams }: { searchParams: Promise<{ postcode?: string; denied?: string }> }) {
  const sp = await searchParams;
  const postcode = await currentPostcode(sp);
  const city = launchCity();
  const [featured, cuisines, settings, promos] = await Promise.all([
    listRestaurants({ postcode, featuredOnly: true }), listCuisines(), getSettings(),
    getDb().then((d) => d.select<Promotion>('promotions', { active: true })),
  ]);
  const all = await listRestaurants({ postcode });
  const offers = settings.feature_plus_enabled ? all.filter((r) => r.has_member_offer).slice(0, 3) : [];
  return (
    <>
      <section className="relative overflow-hidden bg-navy text-white">
        <div aria-hidden className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-gold/15 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-navy-700 blur-2xl" />
        <Container className="relative py-14 sm:py-24">
          <p className="animate-rise text-sm font-semibold uppercase tracking-[0.2em] text-gold">Now in {city.name} · more UK cities coming</p>
          <h1 className="animate-rise mt-4 max-w-3xl font-display text-5xl font-semibold leading-[1.05] sm:text-7xl" style={{ animationDelay: '.05s' }}>
            Your City. Your Food. <span className="text-gold">Your Way.</span>
          </h1>
          <p className="animate-rise mt-5 max-w-xl text-lg text-white/75" style={{ animationDelay: '.1s' }}>
            Order from {city.name} restaurants and takeaways. Each restaurant sets its own delivery area and charges, and delivers with its own drivers.
          </p>
          <div className="animate-rise mt-8 max-w-xl" style={{ animationDelay: '.15s' }}><PostcodeSearch dark initial={postcode ?? ''} /></div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
            <li className="flex items-center gap-2"><Bike size={16} className="text-gold" />Restaurant-run delivery</li>
            <li className="flex items-center gap-2"><ShieldCheck size={16} className="text-gold" />Secure Stripe payments</li>
            <li className="flex items-center gap-2"><HandCoins size={16} className="text-gold" />Collection available</li>
          </ul>
        </Container>
      </section>

      <Container className="py-10">
        {sp.denied && <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">You don&apos;t have access to that page.</p>}
        {isDemo && <p className="mb-6 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800"><strong>Demonstration content.</strong> Every restaurant, menu and price below is fictional and used only to demonstrate FeastQuarter. Nothing here represents a real business.</p>}

        <section aria-labelledby="cuisines">
          <div className="mb-4 flex items-end justify-between"><h2 id="cuisines" className="font-display text-2xl font-semibold text-navy">Popular categories</h2><Link href="/cuisines" className="text-sm font-semibold text-navy hover:underline">All cuisines</Link></div>
          <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
            {cuisines.slice(0, 10).map((c) => { const art = artFor(c.name); return (
              <li key={c.name} className="shrink-0">
                <Link href={`/restaurants?cuisine=${encodeURIComponent(c.name)}${postcode ? `&postcode=${encodeURIComponent(postcode)}` : ''}`} className="flex items-center gap-2.5 rounded-full border border-line bg-white py-2 pl-2 pr-4 text-sm font-semibold text-navy shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
                  <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full text-lg" style={{ background: `linear-gradient(135deg, ${art.a}, ${art.b})` }}>{art.e}</span>{c.name}
                </Link>
              </li>); })}
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="featured">
          <div className="mb-4 flex items-end justify-between"><h2 id="featured" className="font-display text-2xl font-semibold text-navy">Featured restaurants{postcode ? ` near ${postcode}` : ''}</h2><Link href="/restaurants" className="inline-flex items-center gap-1 text-sm font-semibold text-navy hover:underline">See all <ArrowRight size={14} /></Link></div>
          {featured.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{featured.map((r) => <RestaurantCard key={r.id} r={r} postcode={postcode} />)}</div>
            : <Card className="p-8 text-center text-muted">No featured restaurants serve {postcode} yet. We&apos;re adding more every week — try another postcode.</Card>}
        </section>

        <section className="mt-12" aria-labelledby="offers">
          <h2 id="offers" className="mb-4 font-display text-2xl font-semibold text-navy">Local offers</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {promos.slice(0, 1).map((p) => (
              <Card key={p.id} className="p-5"><Badge tone="gold">Promo code</Badge><p className="mt-2 font-display text-xl text-navy">{p.code}</p><p className="mt-1 text-sm text-muted">{p.description}</p></Card>
            ))}
            {offers.map((r) => (
              <Link key={r.id} href={`/restaurants/${r.slug}`}><Card className="h-full p-5 transition hover:shadow-lift"><Badge tone="gold"><Crown size={12} />FeastQuarter Plus members</Badge><p className="mt-2 font-display text-xl text-navy">{r.member_offer.percent}% off at {r.name}</p><p className="mt-1 text-sm text-muted">Orders over {fmt(r.member_offer.min_spend_pence)}. Funded by the restaurant.</p></Card></Link>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Offers shown are real settings in this platform — we never show crossed-out “was” prices or invented savings.</p>
        </section>

        {settings.feature_plus_enabled && <section className="mt-12 overflow-hidden rounded-3xl bg-navy text-white" aria-labelledby="plus">
          <div className="grid gap-6 p-7 sm:p-10 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <Badge tone="gold"><Crown size={12} />FeastQuarter Plus</Badge>
              <h2 id="plus" className="mt-3 font-display text-3xl font-semibold sm:text-4xl">Member offers from local restaurants for {fmt(settings.membership_price_pence)}/month</h2>
              <ul className="mt-4 space-y-1.5 text-white/75">{settings.membership_benefits.map((b) => <li key={b} className="flex gap-2"><span className="text-gold">✓</span>{b}</li>)}</ul>
              <p className="mt-3 text-xs text-white/50">Discounts apply only at participating restaurants and are set by them. Membership does not include free delivery.</p>
            </div>
            <div className="md:text-right"><LinkButton href="/plus" variant="gold" size="lg">Explore membership</LinkButton></div>
          </div>
        </section>}

        <section className="mt-12 grid gap-5 md:grid-cols-2" aria-labelledby="partner">
          <Card className="flex flex-col justify-between p-7">
            <div><Store className="text-gold-600" /><h2 id="partner" className="mt-3 font-display text-2xl font-semibold text-navy">Run a restaurant in {city.name}?</h2>
              <p className="mt-2 text-muted">No joining fee. No monthly fee. A flat {pctLabel(settings.commission_bps)} commission on food for delivery and collection orders, with standard card processing included. You keep your own drivers, delivery areas and delivery charges.</p></div>
            <div className="mt-5"><LinkButton href="/partner" variant="primary">Apply to join</LinkButton></div>
          </Card>
          <Card className="p-7">
            <h2 className="font-display text-2xl font-semibold text-navy">How it works</h2>
            <ol className="mt-3 space-y-3 text-sm text-muted">
              {['Enter your postcode to see who delivers to you.', 'Build one basket from one restaurant and pay securely with Stripe.', 'The restaurant accepts and prepares your order, then delivers it itself or has it ready to collect.'].map((t, i) => (
                <li key={t} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold font-bold text-navy">{i + 1}</span><span className="pt-0.5">{t}</span></li>))}
            </ol>
          </Card>
        </section>
      </Container>
    </>
  );
}

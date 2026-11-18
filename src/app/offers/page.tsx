import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, Container, PageTitle } from '@/components/ui';
import { getDb } from '@/lib/db';
import { fmt } from '@/lib/money';
import { listRestaurants } from '@/lib/services/restaurants';
import { getSettings } from '@/lib/services/settings';
import type { Promotion } from '@/lib/types';
export const metadata: Metadata = { title: 'Offers' };

export default async function Offers() {
  const [promos, rs, settings] = await Promise.all([(await getDb()).select<Promotion>('promotions', { active: true }), listRestaurants(), getSettings()]);
  const now = new Date();
  const live = promos.filter((p) => (!p.ends_at || new Date(p.ends_at) > now) && (p.max_uses === null || p.used_count < p.max_uses) && !p.restaurant_id);
  return (
    <Container className="py-8">
      <PageTitle title="Offers" sub="Every offer here is a real, active setting. Enter codes in your basket." />
      <h2 className="mb-3 font-display text-2xl font-semibold text-navy">Promo codes</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {live.length === 0 && <p className="text-muted">No promo codes are active right now.</p>}
        {live.map((p) => <Card key={p.id} className="p-5"><Badge tone="gold">Code</Badge><p className="mt-2 font-display text-2xl text-navy">{p.code}</p><p className="mt-1 text-sm text-muted">{p.description}</p><p className="mt-2 text-xs text-muted">Min spend {fmt(p.min_spend_pence)}{p.ends_at ? ` · ends ${new Date(p.ends_at).toLocaleDateString('en-GB')}` : ''}. One discount per order.</p></Card>)}
      </div>
      <h2 className="mb-3 mt-10 font-display text-2xl font-semibold text-navy">BD Feast Plus member offers</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {rs.filter((r) => r.has_member_offer).map((r) => <Link key={r.id} href={`/restaurants/${r.slug}`}><Card className="h-full p-5 transition hover:shadow-lift"><p className="font-display text-lg font-semibold text-navy">{r.name}</p><p className="text-2xl font-semibold text-gold-600">{Math.min(r.member_offer.percent, settings.member_discount_max_percent)}% off</p><p className="text-sm text-muted">Members, on orders over {fmt(r.member_offer.min_spend_pence)}.</p></Card></Link>)}
      </div>
      <p className="mt-4 text-sm text-muted"><Link href="/plus" className="font-semibold text-navy underline">Join BD Feast Plus</Link> for {fmt(settings.membership_price_pence)}/month.</p>
    </Container>
  );
}

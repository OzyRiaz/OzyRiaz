import { Clock, Crown, MapPin, Phone, Info } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RememberPostcode } from '@/components/RememberPostcode';
import { MenuView } from '@/components/MenuView';
import { Photo } from '@/components/FoodArt';
import { Badge, Card, Container, Notice } from '@/components/ui';
import { getSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { DAY_KEYS, isOpenNow } from '@/lib/hours';
import { fmt } from '@/lib/money';
import { currentPostcode } from '@/lib/postcode-ctx';
import { ALLERGEN_NOTICE } from '@/lib/allergens';
import { availabilityFor, getMenu, getRestaurantBySlug } from '@/lib/services/restaurants';
import type { DeliveryArea } from '@/lib/types';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = await getRestaurantBySlug((await params).slug);
  return { title: r?.status === 'approved' ? r.name : 'Restaurant' };
}

export default async function RestaurantPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ postcode?: string }> }) {
  const { slug } = await params;
  const r = await getRestaurantBySlug(slug);
  const s = await getSession();
  const staff = !!s && (s.role === 'admin' || s.restaurantIds.includes(r?.id ?? ''));
  if (!r || (r.status !== 'approved' && !staff)) notFound();
  const postcode = await currentPostcode(await searchParams);
  const [menu, areas] = await Promise.all([getMenu(r.id), (await getDb()).select<DeliveryArea>('delivery_areas', { restaurant_id: r.id })]);
  const { availability, area } = availabilityFor(r, areas, postcode);
  const open = isOpenNow(r.opening_hours);
  const orderable = r.status === 'approved' && r.stripe_charges_enabled && availability !== 'unavailable';
  return (
    <>
      <RememberPostcode postcode={postcode} />
      <div className="bg-navy">
        <Container className="grid gap-5 py-6 md:grid-cols-[1fr_auto] md:items-end md:py-10">
          <div>
            <div className="flex flex-wrap gap-2">{r.is_demo && <Badge tone="demo">Demonstration restaurant</Badge>}{r.status !== 'approved' && <Badge tone="red">Not live — {r.status}</Badge>}{!open && <Badge tone="grey">Closed now</Badge>}{r.member_offer.enabled && <Badge tone="gold"><Crown size={12} />{r.member_offer.percent}% off for FeastQuarter Plus</Badge>}</div>
            <h1 className="mt-3 font-display text-4xl font-semibold text-white sm:text-5xl">{r.name}</h1>
            <p className="mt-2 max-w-2xl text-white/75">{r.description}</p>
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/70"><span className="inline-flex items-center gap-1.5"><Clock size={15} className="text-gold" />Ready in ~{r.prep_minutes}–{r.prep_minutes + 15} min</span><span className="inline-flex items-center gap-1.5"><MapPin size={15} className="text-gold" />{r.address_line1}, {r.postcode}</span>{r.phone && <span className="inline-flex items-center gap-1.5"><Phone size={15} className="text-gold" />{r.phone}</span>}</p>
          </div>
          <Photo src={r.image_url} cuisine={r.cuisines[0]} alt="" size="lg" className="hidden h-36 w-56 rounded-2xl shadow-lift md:flex" />
        </Container>
      </div>
      <Container className="py-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            {postcode && availability === 'delivers' && <Notice tone="green">Delivers to {postcode} — delivery charge {area!.fee_pence ? fmt(area!.fee_pence) : 'free'} (set by the restaurant).</Notice>}
            {postcode && availability === 'collection_only' && <Notice tone="navy">This restaurant doesn&apos;t deliver to {postcode}, but you can order for collection.</Notice>}
            {!postcode && <Notice tone="gold">Enter your postcode on the <a className="font-semibold underline" href="/restaurants">restaurants page</a> to check delivery availability — or choose collection at checkout.</Notice>}
            {!r.stripe_charges_enabled && r.status === 'approved' && <div className="mt-3"><Notice tone="red">This restaurant has not finished payment setup and can&apos;t take orders yet.</Notice></div>}
            <MenuView restaurant={{ id: r.id, slug: r.slug, name: r.name }} categories={menu} orderable={orderable} cuisine={r.cuisines[0]} />
          </div>
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card className="p-5">
              <h2 className="font-display text-lg font-semibold text-navy">Delivery & collection</h2>
              <ul className="mt-2 space-y-2 text-sm text-muted">
                {r.delivery_enabled ? areas.map((a) => <li key={a.id}><span className="font-semibold text-navy">{a.name}:</span> {a.postcode_prefixes.join(', ')} — {a.fee_pence ? fmt(a.fee_pence) : 'free'}{a.min_order_pence ? `, min ${fmt(a.min_order_pence)}` : ''}</li>) : <li>No delivery</li>}
                <li>{r.collection_enabled ? 'Collection available' : 'No collection'}{r.min_order_pence ? ` · min order ${fmt(r.min_order_pence)}` : ''}</li>
              </ul>
              <p className="mt-2 text-xs text-muted">Delivered by the restaurant&apos;s own drivers.</p>
            </Card>
            <Card className="p-5">
              <h2 className="font-display text-lg font-semibold text-navy">Opening hours</h2>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">{DAY_KEYS.map((d) => <div key={d} className="contents"><dt className="font-medium capitalize text-navy">{d}</dt><dd className="text-muted">{r.opening_hours[d].length ? r.opening_hours[d].map((p) => `${p.open}–${p.close}`).join(', ') : 'Closed'}</dd></div>)}</dl>
            </Card>
            <Card className="border-gold bg-gold-100 p-5 text-sm text-[#5c430a]"><p className="flex items-center gap-2 font-semibold"><Info size={16} />Allergies</p><p className="mt-1">{ALLERGEN_NOTICE}</p></Card>
          </aside>
        </div>
      </Container>
    </>
  );
}

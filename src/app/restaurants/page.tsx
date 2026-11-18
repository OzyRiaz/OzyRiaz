import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { PostcodeSearch } from '@/components/PostcodeSearch';
import { RestaurantCard } from '@/components/RestaurantCard';
import { Container, EmptyState, PageTitle } from '@/components/ui';
import { currentPostcode } from '@/lib/postcode-ctx';
import { listCuisines, listRestaurants } from '@/lib/services/restaurants';
import { parsePostcode, parseOutwardOnly, postcodeInServedCity } from '@/lib/postcode';

export const metadata: Metadata = { title: 'Restaurants' };

export default async function Restaurants({ searchParams }: { searchParams: Promise<{ postcode?: string; cuisine?: string; q?: string }> }) {
  const sp = await searchParams;
  const postcode = await currentPostcode(sp);
  const outward = postcode ? parsePostcode(postcode)?.outward ?? parseOutwardOnly(postcode) : null;
  const unserved = outward ? !postcodeInServedCity({ outward }) : false;
  const [list, cuisines] = await Promise.all([listRestaurants({ postcode, cuisine: sp.cuisine, q: sp.q }), listCuisines()]);
  const qs = (o: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v) p.set(k, v); return `?${p}`; };
  return (
    <Container className="py-8">
      <PageTitle title="Restaurants" sub={postcode ? `Showing restaurants that deliver to ${postcode} or offer collection` : 'Enter your postcode to see who can serve you'} />
      <div className="max-w-xl"><PostcodeSearch initial={postcode ?? ''} /></div>
      <form className="mt-4 flex max-w-xl gap-2" role="search" aria-label="Search restaurants">
        {postcode && <input type="hidden" name="postcode" value={postcode} />}
        {sp.cuisine && <input type="hidden" name="cuisine" value={sp.cuisine} />}
        <input name="q" defaultValue={sp.q} placeholder="Search restaurants or cuisines" aria-label="Search restaurants or cuisines" className="flex-1 rounded-xl border border-line bg-white px-4 py-2.5 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-gold/60" />
        <button className="rounded-xl border border-navy/25 px-4 text-sm font-semibold text-navy hover:bg-navy-100">Search</button>
      </form>
      <nav aria-label="Cuisine filter" className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href={`/restaurants${qs({ postcode: postcode ?? undefined, q: sp.q })}`} className={clsx('shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold', !sp.cuisine ? 'border-navy bg-navy text-white' : 'border-line bg-white text-navy')}>All</Link>
        {cuisines.map((c) => <Link key={c.name} href={`/restaurants${qs({ postcode: postcode ?? undefined, cuisine: c.name, q: sp.q })}`} aria-current={sp.cuisine === c.name ? 'true' : undefined} className={clsx('shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold', sp.cuisine === c.name ? 'border-navy bg-navy text-white' : 'border-line bg-white text-navy')}>{c.name}</Link>)}
      </nav>
      <div className="mt-6">
        {unserved ? <EmptyState title="We're not in your area yet" body="BD Feast launches in Bradford first, with Leeds and other UK cities planned. Enter a Bradford (BD) postcode to see restaurants." />
          : list.length === 0 ? <EmptyState title="No restaurants found" body={postcode ? `No participating restaurant serves ${postcode} with these filters. Try clearing filters or another postcode.` : 'Try a different search.'} />
          : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">{list.map((r) => <RestaurantCard key={r.id} r={r} postcode={postcode} />)}</div>}
      </div>
    </Container>
  );
}

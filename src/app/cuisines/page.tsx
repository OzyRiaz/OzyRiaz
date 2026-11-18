import type { Metadata } from 'next';
import Link from 'next/link';
import { artFor } from '@/components/FoodArt';
import { Container, PageTitle } from '@/components/ui';
import { listCuisines } from '@/lib/services/restaurants';
export const metadata: Metadata = { title: 'Cuisines' };
export default async function Cuisines() {
  const list = await listCuisines();
  return (
    <Container className="py-8">
      <PageTitle title="Cuisines" sub="Browse Bradford's food by what you're craving." />
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((c) => { const a = artFor(c.name); return (
          <li key={c.name}><Link href={`/restaurants?cuisine=${encodeURIComponent(c.name)}`} className="group relative flex h-40 flex-col justify-end overflow-hidden rounded-2xl p-4 text-white shadow-card transition hover:-translate-y-1 hover:shadow-lift" style={{ background: `linear-gradient(135deg, ${a.a}, ${a.b})` }}>
            <span aria-hidden className="absolute right-3 top-2 text-6xl drop-shadow transition group-hover:scale-110">{a.e}</span>
            <span className="font-display text-xl font-semibold">{c.name}</span><span className="text-xs text-white/80">{c.count} restaurant{c.count === 1 ? '' : 's'}</span>
          </Link></li>); })}
      </ul>
    </Container>
  );
}

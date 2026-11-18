import clsx from 'clsx';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Badge, Container } from '@/components/ui';
import { requireSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import type { Restaurant } from '@/lib/types';
import { DashNav } from './DashNav';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const s = await requireSession('/dashboard');
  if (s.role !== 'restaurant' || !s.restaurantIds[0]) redirect('/partner');
  const r = await (await getDb()).get<Restaurant>('restaurants', { id: s.restaurantIds[0] });
  if (!r) redirect('/partner');
  return (
    <div className="bg-ivory">
      <div className="border-b border-line bg-white">
        <Container className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div className="flex items-center gap-3"><h1 className="font-display text-xl font-semibold text-navy">{r.name}</h1>
            <Badge tone={r.status === 'approved' ? 'green' : r.status === 'pending' ? 'gold' : 'red'}>{r.status === 'approved' ? 'Live' : r.status === 'pending' ? 'Awaiting approval' : r.status}</Badge>{r.is_demo && <Badge tone="demo">Demo</Badge>}</div>
          {r.status === 'approved' && <Link href={`/restaurants/${r.slug}`} className="text-sm font-semibold text-navy underline">View public page</Link>}
        </Container>
        <DashNav />
      </div>
      <Container className="py-6">{children}</Container>
    </div>
  );
}

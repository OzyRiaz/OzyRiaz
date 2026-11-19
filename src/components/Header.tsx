import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { logoutAction } from '@/lib/auth/actions';
import { isDemo } from '@/lib/config';
import { plusEnabled } from '@/lib/services/settings';
import { Logo } from './Logo';
import { BasketButton } from './Chrome';

export async function Header() {
  const s = await getSession();
  const plus = await plusEnabled();
  const nav = [{ href: '/restaurants', label: 'Restaurants' }, { href: '/cuisines', label: 'Cuisines' }, { href: '/offers', label: 'Offers' }, ...(plus ? [{ href: '/plus', label: 'FeastQuarter Plus' }] : []), { href: '/help', label: 'Help' }];
  return (
    <>
      {isDemo && <div className="bg-violet-700 px-4 py-1.5 text-center text-xs font-medium text-white">Demonstration mode — fictional restaurants, simulated payments. No real orders or charges.</div>}
      <header className="no-print sticky top-0 z-50 bg-navy text-white shadow-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="FeastQuarter home"><Logo light /></Link>
          <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
            {nav.map((n) => <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white">{n.label}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <BasketButton />
            {s ? (
              <div className="flex items-center gap-1.5">
                {s.role === 'admin' && <Link href="/admin" className="rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-navy">Admin</Link>}
                {s.role === 'restaurant' && <Link href="/dashboard" className="rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-navy">Dashboard</Link>}
                <Link href="/account" className="hidden rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/10 sm:block">{s.name.split(' ')[0]}</Link>
                <form action={logoutAction}><button className="rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10">Sign out</button></form>
              </div>
            ) : (
              <>
                <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10">Sign in</Link>
                <Link href="/register" className="hidden rounded-lg bg-gold px-3.5 py-2 text-sm font-semibold text-navy hover:bg-gold-600 sm:block">Join</Link>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}

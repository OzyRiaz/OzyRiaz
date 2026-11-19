'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [['/dashboard', 'Orders'], ['/dashboard/menu', 'Menu'], ['/dashboard/delivery', 'Delivery'], ['/dashboard/offers', 'Member offers'], ['/dashboard/earnings', 'Earnings'], ['/dashboard/profile', 'Profile & hours'], ['/dashboard/staff', 'Staff'], ['/dashboard/promote', 'Promote'], ['/dashboard/payments', 'Payments']];
export function DashNav() {
  const p = usePathname();
  return (
    <nav aria-label="Dashboard" className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
      {items.map(([h, l]) => { const on = h === '/dashboard' ? p === h : p.startsWith(h); return <Link key={h} href={h} aria-current={on ? 'page' : undefined} className={clsx('shrink-0 border-b-2 px-4 py-3 text-sm font-semibold', on ? 'border-gold text-navy' : 'border-transparent text-muted hover:text-navy')}>{l}</Link>; })}
    </nav>
  );
}

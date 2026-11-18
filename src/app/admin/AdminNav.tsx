'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
const items = [['/admin', 'Overview'], ['/admin/restaurants', 'Restaurants'], ['/admin/customers', 'Customers'], ['/admin/orders', 'Orders'], ['/admin/finance', 'Finance'], ['/admin/promotions', 'Promotions'], ['/admin/settings', 'Settings'], ['/admin/reports', 'Reports']];
export function AdminNav() {
  const p = usePathname();
  return <nav aria-label="Admin" className="no-scrollbar -mx-4 mt-2 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">{items.map(([h, l]) => { const on = h === '/admin' ? p === h : p.startsWith(h); return <Link key={h} href={h} aria-current={on ? 'page' : undefined} className={clsx('shrink-0 border-b-2 px-4 py-3 text-sm font-semibold', on ? 'border-gold text-navy' : 'border-transparent text-muted hover:text-navy')}>{l}</Link>; })}</nav>;
}

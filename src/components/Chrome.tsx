'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Home, Search, ShoppingBag, ReceiptText, User } from 'lucide-react';
import { useBasket } from './BasketProvider';

export function BasketButton() {
  const { count } = useBasket();
  return (
    <Link href="/basket" aria-label={`Basket, ${count} item${count === 1 ? '' : 's'}`} className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-white hover:bg-white/10">
      <ShoppingBag size={22} />
      {count > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[11px] font-bold text-navy">{count}</span>}
    </Link>
  );
}

const tabs = [
  { href: '/', label: 'Home', icon: Home }, { href: '/restaurants', label: 'Browse', icon: Search },
  { href: '/basket', label: 'Basket', icon: ShoppingBag }, { href: '/orders', label: 'Orders', icon: ReceiptText }, { href: '/account', label: 'Account', icon: User },
];
export function TabBar() {
  const path = usePathname();
  const { count } = useBasket();
  if (/^\/(dashboard|admin|login|register|checkout)/.test(path)) return null;
  return (
    <nav aria-label="Primary" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? 'page' : undefined} className={clsx('relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold', active ? 'text-navy' : 'text-muted')}>
                <Icon size={21} strokeWidth={active ? 2.4 : 1.8} />
                {label}
                {href === '/basket' && count > 0 && <span className="absolute right-[26%] top-1 h-4 min-w-4 rounded-full bg-gold px-1 text-[10px] leading-4 text-navy">{count}</span>}
                {active && <span aria-hidden className="absolute -top-px h-0.5 w-8 rounded bg-gold" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}

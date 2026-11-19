import Link from 'next/link';
import { Logo } from './Logo';

export function Footer({ plus = false }: { plus?: boolean }) {
  const col = (title: string, links: [string, string][]) => (
    <div>
      <h2 className="text-sm font-semibold text-gold">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm text-white/70">{links.map(([h, l]) => <li key={h}><Link href={h} className="hover:text-white">{l}</Link></li>)}</ul>
    </div>
  );
  return (
    <footer className="no-print mt-20 bg-navy pb-24 pt-12 text-white md:pb-12">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-4">
        <div>
          <Logo light />
          <p className="mt-3 font-display text-lg text-gold">Your City. Your Food. Your Way.</p>
          <p className="mt-2 text-sm text-white/60">Local restaurants, delivered by the people who cook your food.</p>
        </div>
        {col('Customers', [['/restaurants', 'Find food'], ...(plus ? ([['/plus', 'FeastQuarter Plus']] as [string, string][]) : []), ['/offers', 'Offers'], ['/help', 'Help & support']])}
        {col('Restaurants', [['/partner', 'Partner with us'], ['/login?next=/dashboard', 'Restaurant sign in']])}
        {col('Legal', [['/legal/terms', 'Terms'], ['/legal/privacy', 'Privacy'], ['/legal/allergens', 'Allergen information']])}
      </div>
      <p className="mx-auto mt-10 max-w-6xl px-4 text-xs text-white/50 sm:px-6">© FeastQuarter. Restaurants make and deliver their own orders. Allergies: always tell the restaurant before ordering.</p>
    </footer>
  );
}

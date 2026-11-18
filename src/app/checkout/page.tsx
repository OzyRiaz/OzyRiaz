import type { Metadata } from 'next';
import { CheckoutForm } from '@/components/CheckoutForm';
import { Container, PageTitle } from '@/components/ui';
import { requireSession } from '@/lib/auth/session';
import { isDemo } from '@/lib/config';
import { getDb } from '@/lib/db';
import type { Address, Profile } from '@/lib/types';
export const metadata: Metadata = { title: 'Checkout' };
export default async function Checkout() {
  const s = await requireSession('/checkout');
  const db = await getDb();
  const [addresses, p] = await Promise.all([db.select<Address>('addresses', { user_id: s.userId }), db.get<Profile>('profiles', { id: s.userId })]);
  return <Container className="py-8"><PageTitle title="Checkout" sub="One restaurant per order." /><CheckoutForm addresses={addresses} phone={p?.phone ?? ''} email={s.email} isDemo={isDemo} /></Container>;
}

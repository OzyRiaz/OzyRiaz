import type { Metadata } from 'next';
import { BasketView } from '@/components/BasketView';
import { Container, PageTitle } from '@/components/ui';
export const metadata: Metadata = { title: 'Basket' };
export default function BasketPage() { return <Container className="py-8"><PageTitle title="Your basket" /><BasketView /></Container>; }

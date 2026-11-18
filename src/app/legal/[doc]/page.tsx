import { notFound } from 'next/navigation';
import { Container, Notice } from '@/components/ui';
import { ALLERGEN_NOTICE } from '@/lib/allergens';

const DOCS: Record<string, { title: string; sections: [string, string][] }> = {
  terms: { title: 'Terms of Service', sections: [
    ['1. About FeastQuarter', 'FeastQuarter operates an online marketplace connecting customers with independent restaurants. The contract for food is between you and the restaurant. Restaurants prepare and deliver their own orders using their own drivers.'],
    ['2. Orders & payment', 'Payments are processed by Stripe. An order is only sent to the restaurant once payment is confirmed. Restaurants may reject an order, in which case you are refunded in full.'],
    ['3. FeastQuarter Plus', 'FeastQuarter Plus is a monthly subscription billed to the platform. It renews until cancelled; cancellation takes effect at the end of the billing period. It does not include free delivery.'],
    ['4. Refunds & disputes', 'Contact the restaurant first about quality or delivery issues. [To be completed after legal review.]'],
    ['5. Liability', '[To be completed after legal review.]'],
  ] },
  privacy: { title: 'Privacy Policy', sections: [
    ['1. Who we are', 'FeastQuarter is the data controller for personal data processed through this service. [Company name, address and ICO registration number to be inserted.]'],
    ['2. What we collect', 'Account details (name, email, phone), saved addresses, order history, and membership status. We never see or store your card number — payments are handled by Stripe.'],
    ['3. Why and legal basis', 'To fulfil orders (contract), prevent fraud and meet accounting duties (legal obligation/legitimate interests), and send service messages. Marketing is opt-in only.'],
    ['4. Sharing', 'We share order details with the restaurant you order from, payment details with Stripe, and use service providers (hosting, email). [Full processor list to be confirmed.]'],
    ['5. Your rights', 'You can download your data and delete your account from Account → Your data & privacy. Financial records are retained in anonymised form for the period required by law.'],
    ['6. Retention', '[Retention schedule to be confirmed after legal review.]'],
  ] },
  allergens: { title: 'Allergen information', sections: [
    ['Your safety', ALLERGEN_NOTICE],
    ['The 14 allergens', 'Restaurants must declare: celery, cereals containing gluten, crustaceans, eggs, fish, lupin, milk, molluscs, mustard, nuts, peanuts, sesame, soya and sulphites.'],
    ['What we show', 'Each menu item lists allergens declared by the restaurant. Items without confirmed allergen information are flagged “Ask restaurant about allergens”.'],
  ] },
};

export default async function Legal({ params }: { params: Promise<{ doc: string }> }) {
  const d = DOCS[(await params).doc];
  if (!d) notFound();
  return (
    <Container className="max-w-3xl py-10">
      <h1 className="font-display text-4xl font-semibold text-navy">{d.title}</h1>
      <div className="mt-4"><Notice tone="gold"><strong>Placeholder — requires legal review.</strong> This is draft text, not legal advice, and must be reviewed by a qualified solicitor before launch.</Notice></div>
      <div className="mt-6 space-y-5">{d.sections.map(([h, t]) => <section key={h}><h2 className="font-display text-xl font-semibold text-navy">{h}</h2><p className="mt-1 text-muted">{t}</p></section>)}</div>
    </Container>
  );
}

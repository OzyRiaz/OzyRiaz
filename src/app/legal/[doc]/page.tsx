import { notFound } from 'next/navigation';
import { Container, Notice } from '@/components/ui';
import { ALLERGEN_NOTICE } from '@/lib/allergens';

const DOCS: Record<string, { title: string; sections: [string, string][] }> = {
  terms: { title: 'Customer Terms of Service', sections: [
    ['1. Who we are and our role', 'FeastQuarter operates an online marketplace that lets you order food from independent restaurants. FeastQuarter is an intermediary: the contract for the food is between you and the restaurant. Restaurants prepare, and (where offered) deliver, their own orders using their own drivers. [Exact legal wording of the intermediary role, trading name, company number and registered address to be inserted after legal review.]'],
    ['2. Prices and what you pay', 'The price shown at checkout is the price you pay: food, any delivery charge set by the restaurant, any tip you choose, less any discount. FeastQuarter adds no service fee and no card surcharge at launch. [VAT presentation to be confirmed with an accountant.]'],
    ['3. Orders and payment', 'Payments are processed by Stripe. An order is only sent to the restaurant once payment is confirmed. A restaurant may decline an order, or may not respond in time; in both cases you are refunded in full.'],
    ['4. Refunds, problems and your rights', 'Contact the restaurant first about late or incorrect food. You can ask us to review a refund from your order page. Nothing in these terms limits your statutory consumer rights. [Cancellation rights, perishable-goods position and complaints process to be completed after legal review.]'],
    ['5. Allergies', 'Allergen information is provided by restaurants. Always tell the restaurant about allergies before ordering. See our allergen information page.'],
    ['6. Accounts', 'You must provide accurate details. We may suspend accounts used for fraud or abuse.'],
    ['7. Liability', '[To be completed after legal review.]'],
  ] },
  'partner-terms': { title: 'Restaurant Partner Terms (summary)', sections: [
    ['Commercial terms at launch', 'No joining fee. No monthly subscription. No mandatory equipment fee. FeastQuarter charges a flat commission on the FOOD subtotal of each order — the same rate for delivery and collection (10% at launch). The commission includes standard card-processing fees: FeastQuarter bears Stripe\'s standard processing charges. Delivery charges and customer tips are not commissionable and belong to the restaurant.'],
    ['How you are paid', 'Customer payments are made through Stripe Connect. The restaurant\'s share is allocated automatically and paid out by Stripe to the restaurant\'s bank account on the payout schedule. Payouts are not instant and are only shown as paid once Stripe confirms them.'],
    ['Your responsibilities', 'You are responsible for food safety, accurate allergen information, accurate menus and prices, preparing orders promptly, and your own delivery drivers, insurance and legal compliance. You remain responsible for your own VAT position.'],
    ['Refunds and disputes', 'If an order is declined or not answered in time, the customer is refunded in full. Refunds and chargebacks may reduce your allocation. Recovery of disputed amounts from the restaurant is governed by the signed agreement. [To be defined after legal review.]'],
    ['Placeholder', 'This summary is a draft for discussion, not a contract. A solicitor-reviewed agreement is required before any restaurant goes live.'],
  ] },
  privacy: { title: 'Privacy Policy', sections: [
    ['1. Who we are', 'FeastQuarter is the data controller for personal data processed through this service. [Company name, address and ICO registration number to be inserted.]'],
    ['2. What we collect', 'Account details (name, email, phone), saved addresses, order history and, if enabled, membership status. We never see or store your card number — payments are handled by Stripe. We keep an optional marketing-source tag (e.g. from a QR code) for 30 days in a cookie to attribute orders; it holds no personal data.'],
    ['3. Why and legal basis', 'To fulfil orders (contract), prevent fraud and meet accounting duties (legal obligation/legitimate interests) and send essential service messages about your order. Marketing is opt-in only and kept separate from order messages.'],
    ['4. Sharing', 'We share order details with the restaurant you order from, payment details with Stripe, and use service providers for hosting, database (Supabase), email and, if enabled, SMS. [Full processor list and international-transfer safeguards to be confirmed.]'],
    ['5. Your rights', 'You can download your data and delete your account from Account → Your data & privacy. Financial records are retained in anonymised form for the period required by law.'],
    ['6. Retention', '[Retention schedule to be confirmed after legal review.]'],
  ] },
  allergens: { title: 'Allergen information', sections: [
    ['Your safety', ALLERGEN_NOTICE],
    ['The 14 allergens', 'Restaurants must declare: celery, cereals containing gluten, crustaceans, eggs, fish, lupin, milk, molluscs, mustard, nuts, peanuts, sesame, soya and sulphites.'],
    ['What we show', 'Each menu item lists allergens declared by the restaurant. Items without confirmed allergen information are flagged "Ask restaurant about allergens". FeastQuarter cannot verify restaurants\' declarations.'],
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

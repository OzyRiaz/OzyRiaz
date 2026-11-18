import type { Metadata } from 'next';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Card, Container, Field, Input, PageTitle, Textarea } from '@/components/ui';
import { supportAction } from '@/app/actions/customer';
import { getSession } from '@/lib/auth/session';
export const metadata: Metadata = { title: 'Help & support' };

const FAQ: [string, string][] = [
  ['Who delivers my food?', 'The restaurant. BD Feast does not employ drivers — each restaurant delivers with its own drivers, sets its own delivery area and delivery charge.'],
  ['Why can’t I see a restaurant near me?', 'Restaurants only appear if they deliver to your postcode or offer collection. We launch in Bradford first and add new areas over time.'],
  ['Can I order from two restaurants at once?', 'No — each order is from one restaurant. Place separate orders if you want food from two places.'],
  ['My order was rejected. Do I get my money back?', 'Yes, in full, automatically. Refunds can take 5–10 working days to appear on your statement.'],
  ['I have a food allergy.', 'Tell the restaurant before ordering and check with them directly. Allergen details on menus are provided by restaurants and can’t be guaranteed by BD Feast.'],
  ['How do I cancel BD Feast Plus?', 'Go to BD Feast Plus and choose “Cancel at end of period”. You keep benefits until the period ends and won’t be charged again.'],
  ['How do I delete my account or download my data?', 'Open Account → “Your data & privacy”.'],
];
export default async function Help() {
  const s = await getSession();
  return (
    <Container className="max-w-3xl py-8">
      <PageTitle title="Help & support" />
      <div className="space-y-2">{FAQ.map(([q, a]) => <details key={q} className="group rounded-2xl border border-line bg-white p-4 shadow-card"><summary className="cursor-pointer list-none font-semibold text-navy marker:hidden">{q}</summary><p className="mt-2 text-sm text-muted">{a}</p></details>)}</div>
      <Card className="mt-8 p-6">
        <h2 className="font-display text-xl font-semibold text-navy">Contact us</h2>
        <p className="mt-1 text-sm text-muted">For an order that’s late or wrong, contact the restaurant first — their number is on your order page. For anything else, send us a message.</p>
        <ActionForm action={supportAction} className="mt-4 space-y-3">
          <Field label="Your email"><Input name="email" type="email" defaultValue={s?.email} required /></Field>
          <Field label="Subject"><Input name="subject" required /></Field>
          <Field label="Message"><Textarea name="message" rows={4} required /></Field>
          <Submit>Send message</Submit>
        </ActionForm>
      </Card>
    </Container>
  );
}

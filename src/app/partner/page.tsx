import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ActionForm, Submit } from '@/components/ActionForm';
import { Card, Container, Field, Input, LinkButton, Select, Textarea } from '@/components/ui';
import { getSession } from '@/lib/auth/session';
import { getDb, DuplicateError } from '@/lib/db';
import type { FormState } from '@/lib/form';
import { defaultHours } from '@/lib/hours';
import { pctLabel } from '@/lib/money';
import { parsePostcode } from '@/lib/postcode';
import { getSettings } from '@/lib/services/settings';
import { notify } from '@/lib/services/notify';
import { cityForOutward, launchCity } from '@/lib/cities';
export const metadata: Metadata = { title: 'Partner with FeastQuarter' };

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

async function applyAction(_: FormState, fd: FormData): Promise<FormState> {
  'use server';
  const s = await getSession();
  if (!s) return { error: 'Please sign in first' };
  const p = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().min(10, 'Add a short description').max(400), cuisines: z.string().trim().min(2), address_line1: z.string().trim().min(3), postcode: z.string(), phone: z.string().trim().min(7).max(20), email: z.string().trim().email(),
    legal_name: z.string().trim().min(2, 'Enter the legal business name').max(120), company_number: z.string().trim().max(20).optional().default(''),
    vat_registered: z.enum(['yes', 'no']), vat_number: z.string().trim().max(20).optional().default(''),
    food_business_reg: z.string().trim().min(3, 'Enter your food business registration reference (from your local council)').max(60),
    food_hygiene_rating: z.string().regex(/^[0-5]?$/, 'Hygiene rating must be 0–5').optional().default(''), food_hygiene_authority: z.string().trim().max(80).optional().default(''), ref: z.string().trim().max(40).optional().default(''),
    accept: z.literal('on', { error: 'Please accept the partner terms' }) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const pc = parsePostcode(p.data.postcode);
  if (!pc) return { error: 'Enter a valid UK postcode' };
  const db = await getDb();
  if (s.restaurantIds.length) return { error: 'Your account already manages a restaurant.' };
  try {
    const r = await db.insert<{ id: string }>('restaurants', {
      owner_id: s.userId, slug: `${slugify(p.data.name)}-${Math.random().toString(36).slice(2, 6)}`, name: p.data.name, description: p.data.description,
      cuisines: p.data.cuisines.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 4), address_line1: p.data.address_line1, postcode: pc.normalised,
      city_slug: cityForOutward(pc.outward)?.slug ?? launchCity().slug, phone: p.data.phone, email: p.data.email, image_url: null, status: 'pending', is_demo: false, featured: false,
      opening_hours: defaultHours(), min_order_pence: 0, prep_minutes: 30, delivery_enabled: true, collection_enabled: true,
      member_offer: { enabled: false, percent: 0, min_spend_pence: 1500, description: '' },
      accepting_orders: false, // restaurants start OFFLINE; they go online once approved, onboarded and ready
      legal_name: p.data.legal_name, company_number: p.data.company_number || null, vat_registered: p.data.vat_registered === 'yes', vat_number: p.data.vat_number || null,
      food_business_reg: p.data.food_business_reg, food_hygiene_rating: p.data.food_hygiene_rating === '' ? null : Number(p.data.food_hygiene_rating), food_hygiene_authority: p.data.food_hygiene_authority || null, referred_by: p.data.ref || null,
      stripe_account_id: null, stripe_details_submitted: false, stripe_charges_enabled: false, stripe_payouts_enabled: false,
    });
    await db.insert('restaurant_staff', { restaurant_id: r.id, user_id: s.userId, role: 'owner' });
    await db.update('profiles', { id: s.userId, role: 'customer' }, { role: 'restaurant' });
    await notify({ kind: 'restaurant_application', to: p.data.email, subject: 'We received your FeastQuarter application', body: `Thanks ${p.data.name}! Our team will review your application. Next steps: complete your menu and connect your Stripe account in the dashboard.` });
    if (process.env.ADMIN_NOTIFY_EMAIL) await notify({ kind: 'admin_new_application', to: process.env.ADMIN_NOTIFY_EMAIL, subject: `New restaurant application: ${p.data.name}`, body: 'Review it in the admin portal.' });
  } catch (e) { if (e instanceof DuplicateError) return { error: 'Please try again' }; throw e; }
  redirect('/dashboard');
}

export default async function Partner({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const ref = (await searchParams).ref ?? '';
  const [s, settings] = await Promise.all([getSession(), getSettings()]);
  return (
    <Container className="max-w-3xl py-10">
      <h1 className="font-display text-4xl font-semibold text-navy">Grow your restaurant with FeastQuarter</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[['No joining fee', 'Start taking orders at no upfront cost.'], ['No monthly fee', 'No subscription and no free-trial gimmicks.'], [`${pctLabel(settings.commission_bps)} flat`, 'Commission on food for delivery AND collection orders. Standard card processing is included — no extra card fees. Delivery charges and tips are yours.']].map(([h, t]) => <Card key={h} className="p-5"><p className="font-display text-xl font-semibold text-navy">{h}</p><p className="mt-1 text-sm text-muted">{t}</p></Card>)}
      </div>
      <p className="mt-4 text-sm text-muted">You keep your own drivers, delivery areas and delivery charges. Payments go straight to your own Stripe account; FeastQuarter&apos;s commission is deducted automatically. Commission applies to food, not your delivery charge.</p>
      <Card className="mt-8 p-6">
        <h2 className="font-display text-2xl font-semibold text-navy">Apply to join</h2>
        {!s ? <div className="mt-3"><p className="text-sm text-muted">Create an account (or sign in) first, then return here to apply.</p><div className="mt-3 flex gap-2"><LinkButton href="/register?next=/partner">Create account</LinkButton><LinkButton href="/login?next=/partner" variant="outline">Sign in</LinkButton></div></div>
          : s.restaurantIds.length ? <p className="mt-2">You already have a restaurant — <Link href="/dashboard" className="font-semibold underline">open your dashboard</Link>.</p>
          : s.role === 'admin' ? <p className="mt-2 text-sm text-muted">Admin accounts can&apos;t apply as restaurants.</p>
          : (
          <ActionForm action={applyAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Restaurant name"><Input name="name" required /></Field>
            <Field label="Cuisines" hint="Comma separated, e.g. Indian, Pakistani"><Input name="cuisines" required /></Field>
            <div className="sm:col-span-2"><Field label="Short description"><Textarea name="description" rows={2} required /></Field></div>
            <Field label="Address"><Input name="address_line1" required /></Field>
            <Field label="Postcode"><Input name="postcode" required /></Field>
            <Field label="Business phone"><Input name="phone" type="tel" required /></Field>
            <div className="sm:col-span-2 mt-1 border-t border-line pt-3"><p className="text-sm font-semibold text-navy">Business & food-safety details <span className="font-normal text-muted">(reviewed by our team before you can go live)</span></p></div>
            <Field label="Legal business name"><Input name="legal_name" required /></Field>
            <Field label="Company number (if a company)"><Input name="company_number" /></Field>
            <Field label="Food business registration reference" hint="Issued by your local council"><Input name="food_business_reg" required /></Field>
            <Field label="Food hygiene rating (0–5)" hint="If you have one"><Input name="food_hygiene_rating" type="number" min={0} max={5} /></Field>
            <Field label="Rating issued by (council)"><Input name="food_hygiene_authority" /></Field>
            <Field label="Are you VAT registered?"><Select name="vat_registered" defaultValue="no"><option value="no">No</option><option value="yes">Yes</option></Select></Field>
            <Field label="Your VAT number (if registered)" hint="Your own VAT status — separate from FeastQuarter's"><Input name="vat_number" /></Field>
            <input type="hidden" name="ref" value={ref} />
            <Field label="Business email"><Input name="email" type="email" defaultValue={s.email} required /></Field>
            <label className="flex items-start gap-2.5 text-sm sm:col-span-2"><input type="checkbox" name="accept" className="mt-0.5 h-4 w-4 accent-[#132c39]" required /><span>I&apos;m authorised to apply for this business and accept the partner terms (draft — requires legal review). I will provide accurate allergen information.</span></label>
            <div className="sm:col-span-2"><Submit variant="gold">Submit application</Submit></div>
          </ActionForm>)}
      </Card>
    </Container>
  );
}

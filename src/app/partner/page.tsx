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
import { cityForOutward } from '@/lib/cities';
export const metadata: Metadata = { title: 'Partner with BD Feast' };

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

async function applyAction(_: FormState, fd: FormData): Promise<FormState> {
  'use server';
  const s = await getSession();
  if (!s) return { error: 'Please sign in first' };
  const p = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().min(10, 'Add a short description').max(400), cuisines: z.string().trim().min(2), address_line1: z.string().trim().min(3), postcode: z.string(), phone: z.string().trim().min(7).max(20), email: z.string().trim().email(), accept: z.literal('on', { error: 'Please accept the partner terms' }) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const pc = parsePostcode(p.data.postcode);
  if (!pc) return { error: 'Enter a valid UK postcode' };
  const db = await getDb();
  if (s.restaurantIds.length) return { error: 'Your account already manages a restaurant.' };
  try {
    const r = await db.insert<{ id: string }>('restaurants', {
      owner_id: s.userId, slug: `${slugify(p.data.name)}-${Math.random().toString(36).slice(2, 6)}`, name: p.data.name, description: p.data.description,
      cuisines: p.data.cuisines.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 4), address_line1: p.data.address_line1, postcode: pc.normalised,
      city_slug: cityForOutward(pc.outward)?.slug ?? 'bradford', phone: p.data.phone, email: p.data.email, image_url: null, status: 'pending', is_demo: false, featured: false,
      opening_hours: defaultHours(), min_order_pence: 0, prep_minutes: 30, delivery_enabled: true, collection_enabled: true,
      member_offer: { enabled: false, percent: 0, min_spend_pence: 1500, description: '' },
      stripe_account_id: null, stripe_details_submitted: false, stripe_charges_enabled: false, stripe_payouts_enabled: false,
    });
    await db.insert('restaurant_staff', { restaurant_id: r.id, user_id: s.userId, role: 'owner' });
    await db.update('profiles', { id: s.userId, role: 'customer' }, { role: 'restaurant' });
    await notify({ kind: 'restaurant_application', to: p.data.email, subject: 'We received your BD Feast application', body: `Thanks ${p.data.name}! Our team will review your application. Next steps: complete your menu and connect your Stripe account in the dashboard.` });
    if (process.env.ADMIN_NOTIFY_EMAIL) await notify({ kind: 'admin_new_application', to: process.env.ADMIN_NOTIFY_EMAIL, subject: `New restaurant application: ${p.data.name}`, body: 'Review it in the admin portal.' });
  } catch (e) { if (e instanceof DuplicateError) return { error: 'Please try again' }; throw e; }
  redirect('/dashboard');
}

export default async function Partner() {
  const [s, settings] = await Promise.all([getSession(), getSettings()]);
  return (
    <Container className="max-w-3xl py-10">
      <h1 className="font-display text-4xl font-semibold text-navy">Grow your restaurant with BD Feast</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[['No joining fee', 'Start taking orders at no upfront cost.'], ['No monthly fee', 'No subscription and no free-trial gimmicks.'], [`${pctLabel(settings.commission_delivery_bps)} / ${pctLabel(settings.commission_collection_bps)}`, 'Commission on delivery / collection food orders. Nothing on orders you don’t get.']].map(([h, t]) => <Card key={h} className="p-5"><p className="font-display text-xl font-semibold text-navy">{h}</p><p className="mt-1 text-sm text-muted">{t}</p></Card>)}
      </div>
      <p className="mt-4 text-sm text-muted">You keep your own drivers, delivery areas and delivery charges. Payments go straight to your own Stripe account; BD Feast&apos;s commission is deducted automatically. Commission applies to food, not your delivery charge.</p>
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
            <Field label="Business email"><Input name="email" type="email" defaultValue={s.email} required /></Field>
            <label className="flex items-start gap-2.5 text-sm sm:col-span-2"><input type="checkbox" name="accept" className="mt-0.5 h-4 w-4 accent-[#132c39]" required /><span>I&apos;m authorised to apply for this business and accept the partner terms (draft — requires legal review). I will provide accurate allergen information.</span></label>
            <div className="sm:col-span-2"><Submit variant="gold">Submit application</Submit></div>
          </ActionForm>)}
      </Card>
    </Container>
  );
}

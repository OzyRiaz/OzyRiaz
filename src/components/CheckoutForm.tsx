'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { placeOrderAction } from '@/app/actions/customer';
import { ALLERGEN_NOTICE } from '@/lib/allergens';
import type { Address } from '@/lib/types';
import { orderKey, useBasket } from './BasketProvider';
import { Summary, useQuote } from './BasketView';
import { btn, Card, EmptyState, Field, Input, Notice, Textarea } from './ui';

export function CheckoutForm({ addresses, phone, email, isDemo, defaultCity }: { addresses: Address[]; phone: string; email: string; isDemo: boolean; defaultCity: string }) {
  const { basket, prefs, setPrefs, hydrated } = useBasket();
  const { res, loading } = useQuote();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [sel, setSel] = useState<string>(addresses[0]?.id ?? 'new');
  const [ack, setAck] = useState(false);
  const [terms, setTerms] = useState(false);
  const [f, setF] = useState({ line1: '', line2: '', city: defaultCity, phone, note: '' });

  if (!hydrated) return <div className="skeleton h-64" aria-busy="true" />;
  if (!basket) return <EmptyState title="Nothing to check out" action={<Link href="/restaurants" className={btn('primary')}>Browse restaurants</Link>} />;
  const delivery = prefs.fulfilment === 'delivery';
  const saved = addresses.find((a) => a.id === sel);
  const address = !delivery ? null : saved ? { line1: saved.line1, line2: saved.line2, city: saved.city, postcode: saved.postcode } : { line1: f.line1, line2: f.line2 || null, city: f.city, postcode: prefs.postcode };

  function pay() {
    setError('');
    if (!terms) { setError('Please accept the Terms and Privacy Policy'); return; }
    start(async () => {
      const r = await placeOrderAction({
        restaurantId: basket!.restaurantId, fulfilment: prefs.fulfilment, postcode: address?.postcode ?? null, promoCode: prefs.promo || null, tipPence: prefs.tip || 0,
        lines: basket!.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, optionChoiceIds: l.optionChoiceIds, note: l.note ?? null })),
        address, phone: f.phone, note: f.note || null, ackAllergens: ack,
        // Same basket + same details => same key => the server returns the existing order instead of creating a duplicate.
        idempotencyKey: orderKey(basket!, [prefs.fulfilment, address, prefs.promo, f.note, prefs.tip]),
      });
      if ('error' in r) { if (r.error.startsWith('Please sign in')) window.location.assign('/login?next=/checkout'); else setError(r.error); } else window.location.assign(r.url);
    });
  }
  // Keep the quote postcode aligned with the chosen saved address.
  if (delivery && saved && prefs.postcode !== saved.postcode) setTimeout(() => setPrefs({ postcode: saved.postcode }), 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <Card className="p-5">
          <h2 className="font-display text-xl font-semibold text-navy">1. {delivery ? 'Delivery details' : 'Collection'}</h2>
          {delivery ? (
            <div className="mt-3 space-y-3">
              {addresses.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-navy has-[:checked]:bg-navy-100">
                  <input type="radio" name="addr" checked={sel === a.id} onChange={() => setSel(a.id)} className="mt-1 accent-[#132c39]" />
                  <span className="text-sm"><strong className="text-navy">{a.label}</strong><br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city} {a.postcode}</span>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3 has-[:checked]:border-navy has-[:checked]:bg-navy-100">
                <input type="radio" name="addr" checked={sel === 'new'} onChange={() => setSel('new')} className="accent-[#132c39]" /><span className="text-sm font-semibold text-navy">Use a new address</span>
              </label>
              {sel === 'new' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Field label="Address line 1"><Input value={f.line1} onChange={(e) => setF({ ...f, line1: e.target.value })} autoComplete="address-line1" required /></Field></div>
                  <Field label="Address line 2 (optional)"><Input value={f.line2} onChange={(e) => setF({ ...f, line2: e.target.value })} autoComplete="address-line2" /></Field>
                  <Field label="Town / city"><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} autoComplete="address-level2" /></Field>
                  <Field label="Postcode" hint="Used to confirm the restaurant delivers to you"><Input value={prefs.postcode} onChange={(e) => setPrefs({ postcode: e.target.value.toUpperCase() })} autoComplete="postal-code" /></Field>
                </div>
              )}
            </div>
          ) : <p className="mt-2 text-sm text-muted">You&apos;ll collect your order from the restaurant. We&apos;ll show the address on your order page.</p>}
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-xl font-semibold text-navy">2. Contact & notes</h2>
          <div className="mt-3 space-y-3">
            <Field label="Mobile number" hint="So the restaurant can reach you about your order"><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" required /></Field>
            <Field label="Note for the restaurant (optional)"><Textarea rows={2} maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. gate code, ring bell" /></Field>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-xl font-semibold text-navy">3. Confirm</h2>
          <div className="mt-3 space-y-3 text-sm">
            <Notice tone="gold">{ALLERGEN_NOTICE}</Notice>
            <label className="flex items-start gap-2.5"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#132c39]" />I&apos;ve read the allergen notice and will tell the restaurant about any allergies.</label>
            <label className="flex items-start gap-2.5"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#132c39]" /><span>I accept the <Link href="/legal/terms" className="underline" target="_blank">Terms</Link> and <Link href="/legal/privacy" className="underline" target="_blank">Privacy Policy</Link>.</span></label>
          </div>
        </Card>
      </div>
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Order from</p>
          <p className="font-display text-xl font-semibold text-navy">{basket.restaurantName}</p>
          <ul className="my-3 space-y-1 text-sm text-muted">{basket.lines.map((l) => <li key={l.key}>{l.qty}× {l.name}</li>)}</ul>
          <Summary res={res} loading={loading} />
          {error && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
          <button onClick={pay} disabled={pending || !res?.ok || !ack} aria-busy={pending} className={btn('gold', 'lg', 'mt-4 w-full')}>
            {pending ? 'Redirecting to payment…' : res?.ok ? `Pay ${(res.quote.total_pence / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })} securely` : 'Pay securely'}
          </button>
          <p className="mt-3 text-center text-xs text-muted">{isDemo ? 'Demo mode: you will be taken to a simulated payment page. No card is charged.' : 'Card payment is handled by Stripe. FeastQuarter never sees or stores your card details.'}</p>
          <p className="mt-1 text-center text-xs text-muted">Signed in as {email}</p>
        </Card>
      </aside>
    </div>
  );
}

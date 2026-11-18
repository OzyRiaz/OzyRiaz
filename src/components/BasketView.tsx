'use client';
import { Bike, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { quoteAction, type QuoteResult } from '@/app/actions/customer';
import { fmt } from '@/lib/money';
import { useBasket } from './BasketProvider';
import { btn, Card, EmptyState, Notice } from './ui';
import clsx from 'clsx';

export function useQuote() {
  const { basket, prefs, hydrated } = useBasket();
  const [res, setRes] = useState<QuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (!hydrated || !basket) return;
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await quoteAction({ restaurantId: basket.restaurantId, fulfilment: prefs.fulfilment, postcode: prefs.postcode || null, promoCode: prefs.promo || null, lines: basket.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, optionChoiceIds: l.optionChoiceIds, note: l.note ?? null })) });
        if (my === seq.current) setRes(r);
      } catch { if (my === seq.current) setRes({ ok: false, error: 'Could not price your basket. Check your connection.' }); }
      finally { if (my === seq.current) setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [basket, prefs, hydrated]);
  return { res, loading };
}

export function Summary({ res, loading }: { res: QuoteResult | null; loading: boolean }) {
  if (!res) return <div className="skeleton h-40" aria-busy="true" aria-label="Pricing your basket" />;
  if (!res.ok) return <Notice tone="red">{res.error}</Notice>;
  const q = res.quote;
  const row = (l: string, v: string, cls = '') => <div className={clsx('flex justify-between', cls)}><dt>{l}</dt><dd>{v}</dd></div>;
  return (
    <dl className={clsx('space-y-2 text-sm transition-opacity', loading && 'opacity-60')} aria-live="polite">
      {row('Food subtotal', fmt(q.subtotal_pence))}
      {q.discount_pence > 0 && row(q.discount_label ?? 'Discount', `−${fmt(q.discount_pence)}`, 'font-medium text-ok')}
      {q.delivery_fee_pence > 0 && row('Delivery (set by restaurant)', fmt(q.delivery_fee_pence))}
      <div className="flex justify-between border-t border-line pt-3 font-display text-xl font-semibold text-navy"><dt>Total</dt><dd>{fmt(q.total_pence)}</dd></div>
      {q.memberHint && <p className="rounded-lg bg-gold-100 px-3 py-2 text-xs text-[#5c430a]">{q.memberHint}. <Link href="/plus" className="font-semibold underline">Learn about BD Feast Plus</Link></p>}
      {q.promoError && <p role="alert" className="text-xs font-medium text-danger">{q.promoError}</p>}
      {!q.open && <p className="text-xs text-danger">This restaurant is currently closed.</p>}
    </dl>
  );
}

export function BasketView() {
  const { basket, prefs, setPrefs, setQty, remove, clear, hydrated } = useBasket();
  const { res, loading } = useQuote();
  const [promo, setPromo] = useState('');
  useEffect(() => setPromo(prefs.promo), [prefs.promo]);
  if (!hydrated) return <div className="skeleton h-64" aria-busy="true" />;
  if (!basket) return <EmptyState title="Your basket is empty" body="Find a restaurant near you and add something delicious." action={<Link href="/restaurants" className={btn('primary')}>Browse restaurants</Link>} />;
  const ok = res?.ok ? res.quote : null;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Ordering from</p><Link href={`/restaurants/${basket.restaurantSlug}`} className="font-display text-2xl font-semibold text-navy hover:underline">{basket.restaurantName}</Link></div>
            <button onClick={() => confirm('Empty your basket?') && clear()} className="text-sm font-medium text-muted hover:text-danger">Clear</button>
          </div>
          <ul className="mt-4 divide-y divide-line">
            {basket.lines.map((l) => (
              <li key={l.key} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1"><p className="font-semibold text-navy">{l.name}</p>{l.optionLabels.length > 0 && <p className="text-xs text-muted">{l.optionLabels.join(', ')}</p>}{l.note && <p className="text-xs italic text-muted">“{l.note}”</p>}</div>
                <div className="flex items-center rounded-lg border border-line">
                  <button onClick={() => setQty(l.key, l.qty - 1)} aria-label={`Decrease ${l.name}`} className="p-2">{l.qty === 1 ? <Trash2 size={15} /> : <Minus size={15} />}</button>
                  <span className="w-6 text-center text-sm font-semibold">{l.qty}</span>
                  <button onClick={() => setQty(l.key, l.qty + 1)} aria-label={`Increase ${l.name}`} className="p-2"><Plus size={15} /></button>
                </div>
                <p className="w-16 text-right text-sm font-semibold text-navy">{fmt(l.unitPence * l.qty)}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">One restaurant per order. Prices are confirmed by the server at checkout.</p>
        </Card>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="p-5">
          <div role="radiogroup" aria-label="Delivery or collection" className="grid grid-cols-2 gap-1 rounded-xl bg-navy-100 p-1">
            {(['delivery', 'collection'] as const).map((f) => (
              <button key={f} role="radio" aria-checked={prefs.fulfilment === f} onClick={() => setPrefs({ fulfilment: f })} className={clsx('flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition', prefs.fulfilment === f ? 'bg-white text-navy shadow' : 'text-muted')}>
                {f === 'delivery' ? <Bike size={16} /> : <ShoppingBag size={16} />}{f === 'delivery' ? 'Delivery' : 'Collection'}
              </button>
            ))}
          </div>
          {prefs.fulfilment === 'delivery' && (
            <label className="mt-3 block text-sm font-semibold text-navy">Delivery postcode
              <input value={prefs.postcode} onChange={(e) => setPrefs({ postcode: e.target.value.toUpperCase() })} placeholder="BD5 0AA" autoComplete="postal-code" className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-base font-normal focus:border-navy focus:outline-none focus:ring-2 focus:ring-gold/60" />
            </label>
          )}
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setPrefs({ promo: promo.trim().toUpperCase() }); }}>
            <label className="sr-only" htmlFor="promo">Promo code</label>
            <input id="promo" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="Promo code" className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm uppercase focus:border-navy focus:outline-none focus:ring-2 focus:ring-gold/60" />
            <button className={btn('outline', 'sm')}>Apply</button>
          </form>
          <div className="mt-4"><Summary res={res} loading={loading} /></div>
          <Link href="/checkout" className={btn('primary', 'lg', 'mt-4 w-full')}>Go to checkout</Link>
          {res && !res.ok && <p className="mt-2 text-xs text-muted">Fix the message above first — you can still continue, and checkout will tell you what's missing.</p>}
          {res && !res.ok && prefs.fulfilment === 'delivery' && <p className="mt-2 text-xs text-muted">Not in their delivery area? <button className="font-semibold underline" onClick={() => setPrefs({ fulfilment: 'collection' })}>Switch to collection</button></p>}
        </Card>
      </aside>
    </div>
  );
}

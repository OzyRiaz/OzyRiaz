'use client';
import clsx from 'clsx';
import { AlertTriangle, Minus, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt } from '@/lib/money';
import type { MenuCategory, MenuItem } from '@/lib/types';
import { useBasket } from './BasketProvider';
import { Photo } from './FoodArt';
import { Badge, btn } from './ui';

type Cat = MenuCategory & { items: MenuItem[] };
interface R { id: string; slug: string; name: string }

export function MenuView({ restaurant, categories, orderable, cuisine }: { restaurant: R; categories: Cat[]; orderable: boolean; cuisine: string }) {
  const [open, setOpen] = useState<MenuItem | null>(null);
  const [active, setActive] = useState(categories[0]?.id);
  const { basket, count } = useBasket();
  const mine = basket?.restaurantId === restaurant.id ? basket : null;
  const subtotal = mine?.lines.reduce((s, l) => s + l.unitPence * l.qty, 0) ?? 0;

  useEffect(() => {
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActive(v.target.id.replace('cat-', '')); }, { rootMargin: '-120px 0px -60% 0px' });
    categories.forEach((c) => { const el = document.getElementById(`cat-${c.id}`); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [categories]);

  return (
    <div>
      <nav aria-label="Menu categories" className="no-scrollbar sticky top-16 z-30 -mx-4 flex gap-2 overflow-x-auto border-b border-line bg-ivory/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-3">
        {categories.map((c) => <a key={c.id} href={`#cat-${c.id}`} aria-current={active === c.id ? 'true' : undefined} className={clsx('shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition', active === c.id ? 'bg-navy text-white' : 'text-navy hover:bg-navy-100')}>{c.name}</a>)}
      </nav>
      {categories.map((c) => (
        <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-32 pt-6" aria-labelledby={`h-${c.id}`}>
          <h2 id={`h-${c.id}`} className="font-display text-2xl font-semibold text-navy">{c.name}</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {c.items.map((it) => (
              <li key={it.id}>
                <div className={clsx('flex h-full gap-3 rounded-2xl border border-line bg-white p-3 shadow-card transition', it.available && 'hover:shadow-lift', !it.available && 'opacity-60')}>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-navy">{it.name}</h3>
                    {it.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{it.description}</p>}
                    <p className="mt-1.5 font-semibold text-navy">{fmt(it.price_pence)}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {it.dietary.map((d) => <Badge key={d} tone="green">{d}</Badge>)}
                      {it.allergens.length > 0 && <Badge tone="gold"><AlertTriangle size={11} />Contains: {it.allergens.join(', ')}</Badge>}
                      {!it.allergen_info_confirmed && <Badge tone="red">Ask restaurant about allergens</Badge>}
                    </div>
                  </div>
                  <div className="relative shrink-0">
                    <Photo src={it.image_url} cuisine={cuisine} alt="" size="sm" className="h-24 w-24 rounded-xl" />
                    {orderable && it.available && (
                      <button onClick={() => setOpen(it)} aria-label={`Add ${it.name}`} className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full bg-gold text-navy shadow-lift transition active:scale-90"><Plus size={20} /></button>
                    )}
                    {!it.available && <span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-navy/80 py-0.5 text-center text-[11px] font-semibold text-white">Unavailable</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {mine && count > 0 && (
        <Link href="/basket" className={btn('gold', 'lg', 'fixed inset-x-4 bottom-20 z-40 mx-auto max-w-md justify-between shadow-lift md:bottom-6')}>
          <span>View basket · {count} item{count === 1 ? '' : 's'}</span><span>{fmt(subtotal)}</span>
        </Link>
      )}
      {open && <ItemDialog item={open} restaurant={restaurant} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ItemDialog({ item, restaurant, onClose }: { item: MenuItem; restaurant: R; onClose: () => void }) {
  const { add } = useBasket();
  const ref = useRef<HTMLDialogElement>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [sel, setSel] = useState<Record<string, string[]>>(() => Object.fromEntries(item.option_groups.map((g) => [g.id, g.min === 1 && g.max === 1 ? [g.choices[0].id] : []])));
  const [err, setErr] = useState('');
  const [conflict, setConflict] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);

  const picked = item.option_groups.flatMap((g) => g.choices.filter((c) => sel[g.id]?.includes(c.id)));
  const unit = item.price_pence + picked.reduce((s, c) => s + c.price_pence, 0);

  function toggle(gid: string, cid: string, max: number) {
    setSel((s) => {
      const cur = s[gid] ?? [];
      if (max === 1) return { ...s, [gid]: [cid] };
      return { ...s, [gid]: cur.includes(cid) ? cur.filter((x) => x !== cid) : cur.length < max ? [...cur, cid] : cur };
    });
  }
  function submit(replace = false) {
    for (const g of item.option_groups) if ((sel[g.id]?.length ?? 0) < g.min) { setErr(`Please choose an option for “${g.name}”`); return; }
    const r = add(restaurant, { itemId: item.id, name: item.name, qty, optionChoiceIds: picked.map((c) => c.id), optionLabels: picked.map((c) => c.name), unitPence: unit, note: note.trim() || undefined }, replace);
    if (r === 'other-restaurant') { setConflict(true); return; }
    onClose();
  }
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="dlg-title"
      className="m-0 mt-auto w-full max-w-lg rounded-t-3xl p-0 backdrop:bg-navy/60 backdrop:backdrop-blur-sm sm:m-auto sm:rounded-3xl">
      <div className="max-h-[88vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 p-5 pb-2">
          <div><h2 id="dlg-title" className="font-display text-2xl font-semibold text-navy">{item.name}</h2><p className="mt-1 text-sm text-muted">{item.description}</p></div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-navy-100"><X size={20} /></button>
        </div>
        {item.allergens.length > 0 && <p className="mx-5 mt-2 rounded-xl bg-gold-100 px-3 py-2 text-xs text-[#5c430a]"><strong>Allergens:</strong> contains {item.allergens.join(', ')}. Tell the restaurant about any allergy before ordering.</p>}
        <div className="space-y-5 p-5">
          {item.option_groups.map((g) => (
            <fieldset key={g.id}>
              <legend className="flex w-full items-center justify-between text-sm font-semibold text-navy">{g.name}<span className="text-xs font-normal text-muted">{g.min ? 'Required' : `Optional · up to ${g.max}`}</span></legend>
              <div className="mt-2 space-y-1.5">
                {g.choices.map((c) => {
                  const on = sel[g.id]?.includes(c.id);
                  return (
                    <label key={c.id} className={clsx('flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm transition', on ? 'border-navy bg-navy-100' : 'border-line hover:border-navy/40')}>
                      <span className="flex items-center gap-2.5"><input type={g.max === 1 ? 'radio' : 'checkbox'} name={g.id} checked={!!on} onChange={() => toggle(g.id, c.id, g.max)} className="h-4 w-4 accent-[#132c39]" />{c.name}</span>
                      {c.price_pence > 0 && <span className="text-muted">+{fmt(c.price_pence)}</span>}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <label className="block text-sm font-semibold text-navy">Special instructions <span className="font-normal text-muted">(optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} rows={2} placeholder="e.g. no onions. Allergies? Tell the restaurant directly." className="mt-1.5 w-full rounded-xl border border-line px-3 py-2 text-sm font-normal focus:border-navy focus:outline-none focus:ring-2 focus:ring-gold/60" />
          </label>
          {err && <p role="alert" className="text-sm font-medium text-danger">{err}</p>}
          {conflict && (
            <div role="alert" className="rounded-xl border border-gold bg-gold-100 p-3 text-sm text-[#5c430a]">
              Your basket has items from another restaurant. You can only order from one restaurant at a time.
              <div className="mt-2 flex gap-2"><button onClick={() => submit(true)} className={btn('primary', 'sm')}>Start a new basket</button><button onClick={onClose} className={btn('outline', 'sm')}>Keep my basket</button></div>
            </div>
          )}
        </div>
        <div className="sticky bottom-0 flex items-center gap-3 border-t border-line bg-white p-4">
          <div className="flex items-center rounded-xl border border-line">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="p-3"><Minus size={16} /></button>
            <span className="w-7 text-center font-semibold" aria-live="polite">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label="Increase quantity" className="p-3"><Plus size={16} /></button>
          </div>
          <button onClick={() => submit()} className={btn('primary', 'lg', 'flex-1 justify-between')}><span>Add to basket</span><span>{fmt(unit * qty)}</span></button>
        </div>
      </div>
    </dialog>
  );
}

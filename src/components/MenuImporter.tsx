'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { commitImportAction } from '@/app/dashboard/menu/import/actions';
import { ALLERGENS, DIETARY } from '@/lib/allergens';
import type { ImportedItem } from '@/lib/menu-import/schema';
import { Badge, Card, Input, Notice, Textarea, btn } from './ui';

type Row = ImportedItem & { include: boolean; price: string };

/** Downscale big photos in the browser so uploads stay small and fast. PDFs and small images pass through. */
async function prepare(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 1_500_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    return blob ? new File([blob], 'menu.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

export function MenuImporter({ aiOn, sample, existingCategories }: { aiOn: boolean; sample: string; existingCategories: string[] }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [publish, setPublish] = useState(false);
  const [saving, startSave] = useTransition();

  async function read(file?: File, override?: string) {
    setError(''); setBusy(true);
    try {
      const fd = new FormData();
      fd.set('text', override ?? text);
      if (file) fd.set('file', await prepare(file));
      const res = await fetch('/api/dashboard/menu-import', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? 'Could not read that menu.'); return; }
      const items: ImportedItem[] = j.menu.items;
      if (!items.length) { setError('We could not find any dishes. Check the text has prices, e.g. "Chicken Karahi £9.95".'); return; }
      setRows(items.map((i) => ({ ...i, include: true, price: i.price_pence === null ? '' : (i.price_pence / 100).toFixed(2), allergens: [], dietary: i.dietary, flags: i.flags, _suggested: i.allergens } as Row)));
      setSuggested(items.map((i) => i.allergens));
      setWarnings(j.menu.warnings ?? []); setChecked(false);
    } finally { setBusy(false); }
  }
  const [suggested, setSuggested] = useState<ImportedItem['allergens'][]>([]);

  const upd = (i: number, p: Partial<Row>) => setRows((r) => r!.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function save() {
    setError('');
    const chosen = rows!.filter((r) => r.include);
    const items = chosen.map((r) => ({ name: r.name, description: r.description, category: r.category, price_pence: Math.round(parseFloat(r.price) * 100), dietary: r.dietary, allergens: r.allergens }));
    if (items.some((i) => !Number.isFinite(i.price_pence) || i.price_pence < 1)) { setError('Every ticked item needs a price, e.g. 9.50. Untick items you do not want.'); return; }
    startSave(async () => {
      const r = await commitImportAction({ items, publish, checked });
      if (r.error) { setError(r.error); return; }
      router.push(`/dashboard/menu?imported=${r.created}&skipped=${r.skipped ?? 0}`);
    });
  }

  if (!rows) return (
    <Card className="space-y-4 p-4">
      <label className="block text-sm font-semibold text-navy">Paste your menu
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="mt-1 font-normal" placeholder={'STARTERS\nOnion Bhaji £4.50\nLamb Karahi – slow cooked £11.95'} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !text.trim()} onClick={() => read()} className={btn('primary')}>{busy ? 'Reading…' : 'Make a draft'}</button>
        <button type="button" disabled={busy} onClick={() => { setText(sample); read(undefined, sample); }} className={btn('outline')}>Try a sample menu</button>
      </div>
      {aiOn ? (
        <label className="block text-sm font-semibold text-navy">…or upload a photo or PDF of your menu
          <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); }} className="mt-1 font-normal" />
          <span className="mt-1 block text-xs font-normal text-muted">Only the menu itself is sent to an AI service to read it. No customer details are ever sent.</span>
        </label>
      ) : <p className="text-xs text-muted">Photo and PDF reading is not switched on yet. Paste the text of your menu for now.</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
    </Card>
  );

  const cats = Array.from(new Set([...existingCategories, ...rows.map((r) => r.category)]));
  return (
    <div className="space-y-4">
      <Notice tone="gold">This is a <b>draft</b>. Computers make mistakes reading menus: check every name and price. Allergen boxes are suggestions only and start <b>unticked</b>. You are responsible for the allergen information shown to customers.</Notice>
      {warnings.length > 0 && <Notice tone="navy"><ul className="list-disc pl-4">{warnings.map((w) => <li key={w}>{w}</li>)}</ul></Notice>}
      <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <Card key={i} className={`space-y-2 p-3 ${r.include ? '' : 'opacity-50'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <input type="checkbox" checked={r.include} onChange={(e) => upd(i, { include: e.target.checked })} aria-label={`Include ${r.name}`} className="h-5 w-5" />
              <Input value={r.name} onChange={(e) => upd(i, { name: e.target.value })} aria-label="Name" className="min-w-0 flex-1" />
              <span className="text-sm text-muted">£</span><Input value={r.price} inputMode="decimal" onChange={(e) => upd(i, { price: e.target.value })} aria-label="Price in pounds" className={`w-24 ${r.price === '' ? 'border-red-400' : ''}`} />
            </div>
            <div className="flex flex-wrap gap-2"><Input list="cats" value={r.category} onChange={(e) => upd(i, { category: e.target.value })} aria-label="Category" className="w-44" /><Input value={r.description} onChange={(e) => upd(i, { description: e.target.value })} aria-label="Description" placeholder="Description (optional)" className="min-w-0 flex-1" /></div>
            {r.flags.length > 0 && <div className="flex flex-wrap gap-1">{r.flags.map((f) => <Badge key={f} tone="gold">{f}</Badge>)}</div>}
            <details className="text-sm"><summary className="cursor-pointer font-semibold text-navy">Dietary &amp; allergens{suggested[i]?.length ? ` · ${suggested[i].length} suggested` : ''}</summary>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{DIETARY.map((d) => <label key={d} className="flex items-center gap-1"><input type="checkbox" checked={r.dietary.includes(d)} onChange={() => upd(i, { dietary: toggle(r.dietary, d) })} />{d}</label>)}</div>
              <p className="mt-2 text-xs text-muted">Contains (tick only what you are sure about):</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">{ALLERGENS.map((a) => <label key={a} className="flex items-center gap-1"><input type="checkbox" checked={r.allergens.includes(a)} onChange={() => upd(i, { allergens: toggle(r.allergens, a) })} />{a}{suggested[i]?.includes(a) && <Badge tone="gold">suggested</Badge>}</label>)}</div>
            </details>
          </Card>
        ))}
      </div>
      <Card className="space-y-3 p-4">
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 h-4 w-4" /><span>I have checked every name and price.</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="mt-1 h-4 w-4" /><span>Make items available to order straight away. <span className="text-muted">(Leave unticked to save them hidden, then switch on one by one after confirming allergens.)</span></span></label>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap gap-2"><button type="button" disabled={saving || !checked} onClick={save} className={btn('primary')}>{saving ? 'Saving…' : `Save ${rows.filter((r) => r.include).length} items`}</button><button type="button" onClick={() => { setRows(null); setError(''); }} className={btn('outline')}>Start again</button></div>
      </Card>
    </div>
  );
}

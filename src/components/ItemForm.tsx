'use client';
import { useState } from 'react';
import { saveItemAction } from '@/app/dashboard/actions';
import { ALLERGENS, DIETARY } from '@/lib/allergens';
import type { MenuCategory, MenuItem } from '@/lib/types';
import { ActionForm, Submit } from './ActionForm';
import { ImageUpload } from './ImageUpload';
import { Field, Input, Select, Textarea } from './ui';

export function ItemForm({ item, categories, restaurantId, optionsText, cuisine }: { item?: MenuItem; categories: MenuCategory[]; restaurantId: string; optionsText: string; cuisine: string }) {
  const [none, setNone] = useState(false);
  return (
    <ActionForm action={saveItemAction} className="space-y-4">
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Item name"><Input name="name" defaultValue={item?.name} required /></Field>
        <Field label="Price (£)"><Input name="price" inputMode="decimal" defaultValue={item ? (item.price_pence / 100).toFixed(2) : ''} placeholder="9.50" required /></Field>
        <Field label="Category"><Select name="category_id" defaultValue={item?.category_id} required>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <div className="flex items-end"><label className="flex items-center gap-2 text-sm font-semibold text-navy"><input type="checkbox" name="available" defaultChecked={item?.available ?? true} className="h-5 w-5 accent-[#132c39]" />Available to order</label></div>
      </div>
      <Field label="Description"><Textarea name="description" rows={2} defaultValue={item?.description} /></Field>
      <div><p className="mb-1.5 text-sm font-semibold text-navy">Photo</p><ImageUpload name="image_url" restaurantId={restaurantId} initial={item?.image_url} cuisine={cuisine} /></div>
      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-navy">Allergens (UK 14) <span className="font-normal text-muted">— tick every one this item contains</span></legend>
        <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-3">{ALLERGENS.map((a) => <label key={a} className="flex items-center gap-2 text-sm capitalize"><input type="checkbox" name="allergens" value={a} defaultChecked={item?.allergens.includes(a)} onChange={() => setNone(false)} className="h-4 w-4 accent-[#132c39]" />{a}</label>)}</div>
        <div className="mt-3 flex flex-wrap gap-4 border-t border-line pt-3">{DIETARY.map((d) => <label key={d} className="flex items-center gap-2 text-sm capitalize"><input type="checkbox" name="dietary" value={d} defaultChecked={item?.dietary.includes(d)} className="h-4 w-4 accent-[#132c39]" />{d}</label>)}</div>
        <label className="mt-3 flex items-start gap-2 rounded-lg bg-gold-100 p-3 text-sm text-[#5c430a]"><input type="checkbox" name="confirm" defaultChecked={!!item?.allergen_info_confirmed} className="mt-0.5 h-4 w-4 accent-[#132c39]" />I confirm the allergen information above is accurate and complete for this item (including if none are ticked).</label>
      </fieldset>
      <Field label="Options & extras (optional)" hint={'Format — group line: "Name | min | max", then one choice per line: "Choice | extra price". Blank line between groups.'}>
        <Textarea name="options" rows={7} defaultValue={optionsText} className="font-mono text-xs" placeholder={'Size | 1 | 1\n10 inch | 0\n12 inch | 3.00\n\nExtra toppings | 0 | 3\nMushrooms | 1.00\nOlives | 1.00'} />
      </Field>
      <Submit variant="gold">Save item</Submit>
    </ActionForm>
  );
}
